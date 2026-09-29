"""End-to-end tests for the merged system through the real HTTP API (FastAPI TestClient).

Needs: loaded Neon DB (sql_pipeline/load_data.py) and the Chroma store
(rag_pipeline/pipeline.py, or it is built on first startup). Tests marked
`live_llm` call Groq.

Run from the repo root:  python -m pytest -v
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402

needs_groq = pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")

WORKED_EXAMPLE = {
    "symptoms": "truck has erratic power and black smoke under load",
    "fault_codes": ["SPN 102 FMI 2"],
    "vehicle": {"make": "Freightliner", "model": "Cascadia", "year": 2018, "engine": "DD15"},
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs lifespan -> loads the vector store once
        yield c


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok", body
    assert body["fault_entries"] == 125296
    assert body["vector_chunks"] > 0


def test_decode_j1939(client):
    r = client.get("/decode", params={"code": "SPN 102 FMI 2"})
    assert r.status_code == 200
    body = r.json()
    assert body["component"] == "Engine Intake Manifold #1 Pressure"
    assert body["description"] == "Data Erratic, Intermittent Or Incorrect"
    assert body["manufacturer_specific_data"] is False


@pytest.mark.parametrize("code,status", [("P0299", 404), ("SPN 99999 FMI 2", 404), ("hello", 422)])
def test_decode_rejects(client, code, status):
    assert client.get("/decode", params={"code": code}).status_code == status


def test_diagnose_requires_input(client):
    assert client.post("/diagnose", json={"symptoms": "", "fault_codes": []}).status_code == 422


def test_diagnose_worked_example_evidence_only(client, monkeypatch):
    """Deterministic: both branches merged, no LLM."""
    import hybrid
    monkeypatch.setattr(hybrid, "synthesize", lambda *a, **k: pytest.fail("LLM must not be called"))
    from hybrid import diagnose
    out = diagnose(**WORKED_EXAMPLE, use_llm=False)

    [code] = out["sql"]["codes"]
    assert (code["spn"], code["fmi"], code["found"]) == (102, 2, True)
    assert code["sql_result"]["manufacturer_specific_data"] is False
    assert out["sql"]["vehicle"]["manufacturer"] == "Freightliner"
    assert out["sql"]["vehicle"]["extraction_method"] == "provided"
    assert out["sql"]["symptom_text"] == "truck has erratic power and black smoke under load"
    # the symptom is searched on its own, not mixed with the code's component name
    assert out["retrieval_query"] == "truck has erratic power and black smoke under load"
    assert len(out["matches"]) == 4 and all(m["fault_name"] for m in out["matches"])
    assert out["answer"] is None
    assert any("no manufacturer-specific data for SPN 102 FMI 2" in w for w in out["warnings"])


@needs_groq
def test_diagnose_worked_example_full(client):
    r = client.post("/diagnose", json=WORKED_EXAMPLE)
    assert r.status_code == 200
    body = r.json()
    print("\n--- answer ---\n" + (body["answer"] or "<none>") + "\n--- warnings ---\n" + "\n".join(body["warnings"]))
    assert body["answer"], body["warnings"]
    assert "**1. Fault Code Analysis**" in body["answer"] and "**7. Source / Evidence**" in body["answer"]
    assert "[J1939 DB]" in body["answer"]  # SQL evidence is cited
    assert body["relationship"]["code"] in "ABCD"
    assert body["sql"]["codes"][0]["sql_result"]["sae_standard"]["spn_name"] == "Engine Intake Manifold #1 Pressure"


@needs_groq
def test_symptom_only(client):
    body = client.post("/diagnose", json={"symptoms": "ABS warning light on and brake pedal pulsation"}).json()
    assert body["sql"]["codes"] == []
    assert body["matches"][0]["system_category"]  # vector branch found something
    assert any("ABS" in m["fault_name"] or "ABS" in m["system_category"] for m in body["matches"])
    assert body["answer"]


@needs_groq
def test_invalid_code_and_obd_code_do_not_crash(client):
    body = client.post("/diagnose", json={
        "symptoms": "rough idle", "fault_codes": ["SPN 99999 FMI 2", "P0299"]}).json()
    [bad] = body["sql"]["codes"]
    assert bad["found"] is False and bad["error"]["type"] == "SPNNotFoundError"
    assert body["obd_codes"] == ["P0299"]
    assert any("OBD-II" in w for w in body["warnings"])
    assert body["answer"]


@needs_groq
def test_legacy_query_endpoint(client):
    body = client.post("/query", json={"query": "engine overheating and coolant leak"}).json()
    assert {"query", "matches", "answer"} <= set(body)
    assert body["matches"]


# --------------------------------------------------------------------------- answer guardrails (offline)

def _sql_for(code="SPN 100 FMI 1"):
    from orchestrator import resolve
    return resolve(code, use_llm_fallback=False)


def test_fault_code_section_is_deterministic_and_flags_generic_decode():
    from synthesis import GENERIC_ONLY, fault_code_section
    section = fault_code_section(_sql_for(), [])
    assert "SPN 100: Engine Oil Pressure" in section
    assert "FMI 1: Data Valid But Below Normal Operational Range" in section
    assert "Most Severe Level" in section
    assert GENERIC_ONLY in section
    assert "Generic J1939 decode only — no manufacturer-specific record was found." in section


def test_invented_sources_are_relabelled():
    from synthesis import enforce_sources
    matches = [{"fault_name": "Oil Pump"}]
    text, problems = enforce_sources(
        "a [Code DB] b [Service docs: Oil Pump] c [Service docs: Turbo] d [Manufacturer record] e [see step 2]",
        matches, has_record=False)
    assert text == "a [Inference] b [Service docs: Oil Pump] c [Inference] d [Inference] e [see step 2]"
    assert len(problems) == 3


def test_unverified_spn_numbers_are_removed_and_names_corrected():
    from synthesis import enforce_spns
    text, problems = enforce_spns(
        "check SPN 91 (Engine Speed), SPN 158 (TPS voltage) and SPN 100 FMI 1", _sql_for())
    assert "SPN 91 (Accelerator Pedal Position 1)" in text  # wrong name replaced from the DB
    assert "SPN 158" not in text and "a related parameter" in text
    assert "SPN 100 FMI 1" in text
    assert problems == ["answer mentioned unverified SPN 158; number removed"]


def test_invented_values_are_flagged():
    from synthesis import flag_unverified_values
    text, problems = flag_unverified_values("supply (typically 5 V); range 0.0 to 145.037738 psi",
                                            "data range 0.0 to 145.037738 psi")
    assert "5 V [unverified value]" in text
    assert "145.037738 psi [unverified value]" not in text
    assert len(problems) == 1


def test_unrelated_service_doc_lines_are_dropped():
    from synthesis import drop_dismissed_docs
    text, problems = drop_dismissed_docs(
        "- Service-doc similarity: Throttle Body - poor acceleration [Service docs: Throttle Body]\n"
        "- Service-doc similarity: Starter Motor - symptoms are unrelated [Service docs: Starter Motor]. (Ignored for relevance.)")
    assert "Throttle Body" in text and "Starter Motor" not in text
    assert len(problems) == 1


def test_daily_quota_falls_back_to_next_model_without_waiting(monkeypatch):
    import time

    import httpx
    import synthesis
    from groq import RateLimitError

    calls = []

    class FakeGroq:
        def __init__(self, **_):
            self.chat = self
            self.completions = self

        def create(self, model, **_):
            calls.append(model)
            if model == "primary":
                resp = httpx.Response(429, headers={"retry-after": "900"},  # daily limit: 15 min
                                      request=httpx.Request("POST", "https://api.groq.com"))
                raise RateLimitError("tokens per day", response=resp, body=None)
            msg = type("M", (), {"content": "<think>hidden</think>**2. Symptom Analysis**\n- ok"})
            return type("C", (), {"choices": [type("Ch", (), {"message": msg})]})

    monkeypatch.setattr(synthesis, "Groq", FakeGroq)
    monkeypatch.setattr(synthesis, "GROQ_MODEL", "primary")
    monkeypatch.setattr(synthesis, "FALLBACK_MODELS", ["backup"])
    start = time.time()
    text, model, warnings = synthesis._complete("prompt")
    assert time.time() - start < 2  # did not sit out the 15-minute retry-after
    assert calls == ["primary", "backup"] and model == "backup"
    assert text == "**2. Symptom Analysis**\n- ok"  # inline reasoning stripped
    assert warnings == ["Groq model primary hit its daily token limit, resets in ~900s"]


def test_ambiguous_relationship_is_rejected():
    from synthesis import parse_relationship
    assert parse_relationship("**Relationship:** C. NOT DIRECTLY RELATED")[0]["code"] == "C"
    rel, problems = parse_relationship("**Relationship:** A. DIRECTLY CONSISTENT / B. POTENTIALLY RELATED")
    assert rel is None and problems


# --------------------------------------------------------------------------- spec test cases (live Groq)

UNRELATED_TO_OIL = ("Throttle Position Sensor", "Starter Motor", "Fuel Filter")


@needs_groq
def test_spec_case_1_accelerator_symptom_with_low_oil_pressure_code(client):
    body = client.post("/diagnose", json={
        "symptoms": "The accelerator pedal is not responding properly and the engine doesn't increase RPM when I press it.",
        "fault_codes": ["SPN 100 FMI 1"]}).json()
    answer = body["answer"]
    print("\n" + answer + "\nWARNINGS: " + str(body["warnings"]))
    # separate analyses + combined result, all 7 sections
    for n in range(1, 8):
        assert f"**{n}. " in answer
    assert "Generic J1939 decode only — no manufacturer-specific record was found." in answer
    # the symptom is NOT established by the code, and no causal link is asserted
    assert body["relationship"]["code"] in ("B", "C"), body["relationship"]
    assert "separate" in answer.lower()
    low = answer.lower()
    assert "caused by a faulty tps" not in low and "definitely caused by low oil pressure" not in low
    # derate/limp is allowed only as a possibility
    if "derate" in low or "limp" in low:
        assert any(w in low for w in ("inference", "calibration", "manufacturer", "not documented", "possib"))
    assert "most likely" not in low
    assert "[Code DB]" not in answer
    safety = answer.split("**6. Safety**")[1].split("**7.")[0].lower()
    assert "engine damage" in safety and "unsafe operation" in safety  # low oil pressure + no throttle response


@needs_groq
def test_spec_case_2_low_oil_pressure_symptom_matches_code(client):
    body = client.post("/diagnose", json={
        "symptoms": "The engine oil pressure is very low and the oil pressure warning light is on.",
        "fault_codes": ["SPN 100 FMI 1"]}).json()
    answer = body["answer"]
    print("\n" + answer + "\nWARNINGS: " + str(body["warnings"]))
    assert body["relationship"] == {"code": "A", "label": "DIRECTLY CONSISTENT"}
    assert "Generic J1939 decode only — no manufacturer-specific record was found." in answer
    for unrelated in UNRELATED_TO_OIL:
        assert unrelated not in answer
    safety = answer.split("**6. Safety**")[1].split("**7.")[0].lower()
    assert "engine damage" in safety  # spec: clearly state the safety concern
