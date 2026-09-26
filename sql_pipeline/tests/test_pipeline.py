"""End-to-end tests for the SQL branch. Requires a loaded database (python load_data.py).

Run: pytest -v            (add -s to see the full resolve() output for the worked example)
"""
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extractor import extract  # noqa: E402
from orchestrator import resolve  # noqa: E402
from query import (  # noqa: E402
    FaultCodeNotFoundError,
    FMINotFoundError,
    InvalidFaultCodeError,
    SPNNotFoundError,
    fetch_fault_code,
)
from db import get_engine  # noqa: E402
from sqlalchemy import text  # noqa: E402

WORKED_EXAMPLE = ("2018 Freightliner DD15 throwing SPN 102 FMI 2, truck has erratic power "
                  "and black smoke under load")


# --------------------------------------------------------------------------- data sanity

def test_loaded_row_counts():
    with get_engine().connect() as conn:
        counts = {t: conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar_one()
                  for t in ("spn_catalog", "fmi_catalog", "fault_entries")}
        doc = conn.execute(text("SELECT COUNT(*) FROM fault_entries WHERE has_manufacturer_doc")).scalar_one()
    assert counts == {"spn_catalog": 3708, "fmi_catalog": 32, "fault_entries": 125296}
    assert doc == 1969


def test_spn_102_fmi_2_has_no_documented_text_in_db():
    """Verified against loaded data: SITRAK lists SPN 102 FMI 2 but with a blank
    description, so there is no usable manufacturer doc for it."""
    with get_engine().connect() as conn:
        rows = conn.execute(text(
            "SELECT documentation_status, manufacturer, has_manufacturer_doc FROM fault_entries "
            "WHERE spn = 102 AND fmi = 2 ORDER BY documentation_status")).all()
    assert ("reference_combination", None, False) in [tuple(r) for r in rows]
    assert not any(r.has_manufacturer_doc for r in rows)


# --------------------------------------------------------------------------- fetch_fault_code

def test_spn_102_fmi_2_generic_result():
    r = fetch_fault_code(102, 2)
    assert r["fault_code"] == "SPN 102 FMI 2"
    assert r["sae_standard"]["spn_name"] == "Engine Intake Manifold #1 Pressure"  # boost pressure
    assert r["sae_standard"]["fmi_meaning"] == "Data Erratic, Intermittent Or Incorrect"
    assert r["sae_standard"]["severity"] is None
    assert r["manufacturer_specific_data"] is False
    assert r["manufacturer_record"] is None
    assert any("no documented manufacturer-specific fault record" in n.lower() for n in r["notes"])
    # SITRAK lists the code but with no text - surfaced, not silently dropped
    assert r["undocumented_manufacturer_entries"] == [{"manufacturer": "SITRAK", "manufacturer_system": "CFV/EGR"}]
    assert "possible_causes" in r["unavailable_fields"]
    assert "diagnostic_steps" in r["unavailable_fields"]


def test_documented_code_prefers_matching_manufacturer():
    r = fetch_fault_code(102, 16, manufacturer="Sinotruk")  # alias -> SITRAK
    assert r["manufacturer_requested"] == "SITRAK"
    assert r["manufacturer_specific_data"] is True
    rec = r["manufacturer_record"]
    assert rec["manufacturer"] == "SITRAK"
    assert "air pressure" in rec["description"].lower()
    assert r["sae_standard"]["spn_name"] == "Engine Intake Manifold #1 Pressure"  # baseline still present


def test_documented_code_other_manufacturer_is_not_claimed():
    r = fetch_fault_code(102, 16, manufacturer="Freightliner")
    assert r["manufacturer_specific_data"] is False
    assert r["manufacturer_record"] is None
    assert r["other_manufacturer_records"][0]["manufacturer"] == "SITRAK"
    assert any("No documented Freightliner-specific" in n for n in r["notes"])


def test_invalid_spn_raises_typed_error():
    with pytest.raises(SPNNotFoundError) as exc:
        fetch_fault_code(99999, 2)
    assert isinstance(exc.value, FaultCodeNotFoundError)
    assert exc.value.spn == 99999


def test_invalid_fmi_raises_typed_error():
    with pytest.raises(FMINotFoundError):
        fetch_fault_code(102, 29_999)


def test_out_of_range_values_rejected():
    with pytest.raises(InvalidFaultCodeError):
        fetch_fault_code(-1, 2)
    with pytest.raises(InvalidFaultCodeError):
        fetch_fault_code(600_000, 2)
    with pytest.raises(InvalidFaultCodeError):
        fetch_fault_code("102", 2)


# --------------------------------------------------------------------------- extractor

@pytest.mark.parametrize("raw", [
    "SPN 102 FMI 2", "spn 102 fmi 2", "SPN: 102 / FMI: 2", "102-2", "spn102fmi2",
    "SPN102FMI2", "  SPN  :  102   FMI:2 ", "SPN-102 FMI-2", "SPN 102, FMI 2", "SPN 102-2",
])
def test_code_formats(raw):
    assert [(c["spn"], c["fmi"]) for c in extract(raw, use_llm_fallback=False).codes] == [(102, 2)]


def test_no_false_positive_codes():
    e = extract("2018-19 truck idles at 2000 rpm, boost 20 - 25 psi", use_llm_fallback=False)
    assert e.codes == []
    assert e.vehicle["year"] is None


def test_brief_example_extraction():
    e = extract("2018 Freightliner Cascadia with DD15 derating, losing boost on highway hills, "
                "throwing SPN 102 FMI 2", use_llm_fallback=False)
    assert [(c["spn"], c["fmi"]) for c in e.codes] == [(102, 2)]
    assert e.vehicle["manufacturer"] == "Freightliner"
    assert e.vehicle["model"] == "Cascadia"
    assert e.vehicle["engine"] == "DD15"
    assert e.vehicle["year"] == 2018
    assert e.symptom_text == "derating, losing boost on highway hills"


# --------------------------------------------------------------------------- resolve()

def test_symptom_only_input():
    out = resolve("Truck loses power on inclines and blows white smoke at idle", use_llm_fallback=False)
    assert out["codes"] == []
    assert out["symptom_text"] == "Truck loses power on inclines and blows white smoke at idle"
    assert out["has_manufacturer_specific_data"] is False
    assert any("symptom-only" in w for w in out["warnings"])


def test_resolve_invalid_spn_does_not_crash():
    out = resolve("Volvo VNL showing SPN 99999 FMI 2 and rough idle", use_llm_fallback=False)
    [code] = out["codes"]
    assert code["found"] is False and code["sql_result"] is None
    assert code["error"]["type"] == "SPNNotFoundError"
    assert out["vehicle"]["manufacturer"] == "Volvo"
    assert out["symptom_text"] == "rough idle"


def test_worked_example_full_output():
    out = resolve(WORKED_EXAMPLE, use_llm_fallback=False)
    print("\n" + json.dumps(out, indent=2, ensure_ascii=False))

    assert set(out) >= {"codes", "vehicle", "symptom_text", "warnings"}
    [code] = out["codes"]
    assert (code["spn"], code["fmi"], code["found"]) == (102, 2, True)
    sql = code["sql_result"]
    assert sql["sae_standard"]["summary"] == \
        "Engine Intake Manifold #1 Pressure - Data Erratic, Intermittent Or Incorrect"
    assert sql["manufacturer_specific_data"] is False
    assert out["vehicle"] == {"manufacturer": "Freightliner", "model": None, "engine": "DD15",
                              "engine_manufacturer": "Detroit", "year": 2018,
                              "extraction_method": "keyword"}
    assert out["symptom_text"] == "truck has erratic power and black smoke under load"
    assert any(w.startswith("no manufacturer-specific data for SPN 102 FMI 2") for w in out["warnings"])


@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_llm_vehicle_fallback_live():
    """Misspelt brand: keywords miss it, Groq fallback recovers it (live API call)."""
    e = extract("my frieghtliner cascadea keeps derating on hills", use_llm_fallback=True)
    assert e.vehicle_extraction_method == "llm", e.notes
    assert e.vehicle["manufacturer"] == "Freightliner"
    assert e.vehicle["model"] == "Cascadia"
    assert e.symptom_text == "keeps derating on hills"


@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set")
def test_llm_cannot_invent_vehicle_live():
    """Pure symptom text: whatever the LLM says, nothing not in the input may be kept."""
    e = extract("Truck loses power on inclines and idles rough", use_llm_fallback=True)
    assert all(e.vehicle[k] is None for k in ("manufacturer", "model", "engine", "year"))
    assert e.symptom_text == "Truck loses power on inclines and idles rough"
