"""Hybrid diagnosis: SQL exact-match branch + vector-DB semantic branch + Groq synthesis.

    diagnose(symptoms, fault_codes, vehicle) -> dict

Response shape (a superset of rag_pipeline/api.py's /query response, so older
callers that only read query/matches/answer keep working):
{
  "query": str,                 # symptoms as sent
  "retrieval_query": str,       # what was actually embedded for the vector search
  "matches": [ {fault_name, system_category, severity, section, content, steps, distance} ],
  "answer": str | None,         # 7-section answer; sections 1 and 7 are deterministic. Without Groq,
                                #   only those two sections (see warnings); None only when use_llm=False
  "relationship": {"code": "A|B|C|D", "label": str} | None,   # code-vs-symptom classification
  "cited_service_docs": [str],  # service-doc entries the answer actually used (others judged unrelated)
  "sql": { ...sql_pipeline.orchestrator.resolve() output... },
  "obd_codes": [str],           # OBD-II codes passed through (SQL branch is J1939-only)
  "warnings": [str]
}
"""
import json
import os
import re
import threading

import bootstrap  # noqa: F401  (sys.path + .env + absolute RAG paths; must come first)

from extractor import extract
from orchestrator import resolve
from synthesis import SynthesisUnavailable, fault_code_section, source_section, synthesize

OBD_CODE = re.compile(r"^[PBCU][0-3][0-9A-F]{3}$", re.IGNORECASE)
TOP_K = 4

_vectordb = None
_vectordb_lock = threading.Lock()


def get_vectordb():
    """Load the persisted Chroma store, building it once if it does not exist yet."""
    global _vectordb
    with _vectordb_lock:
        if _vectordb is None:
            from langchain_chroma import Chroma

            from build_store import COLLECTION_NAME, DEFAULT_DATASET_PATH, DEFAULT_PERSIST_DIR, build_vector_store
            from embed_store import get_embedder

            if os.path.isdir(DEFAULT_PERSIST_DIR):
                _vectordb = Chroma(collection_name=COLLECTION_NAME, embedding_function=get_embedder(),
                                   persist_directory=DEFAULT_PERSIST_DIR)
            else:
                _vectordb = build_vector_store(json_path=DEFAULT_DATASET_PATH,
                                               persist_directory=DEFAULT_PERSIST_DIR)
        return _vectordb


def vector_search(text: str, k: int = TOP_K) -> list[dict]:
    matches = []
    for doc, distance in get_vectordb().similarity_search_with_score(text, k=k):
        meta = doc.metadata
        steps = None
        if meta.get("Steps_JSON"):
            try:
                steps = json.loads(meta["Steps_JSON"])
            except (json.JSONDecodeError, TypeError):
                steps = None
        matches.append({
            "fault_name": meta.get("Fault_Name", ""),
            "system_category": meta.get("System_Category", ""),
            "severity": meta.get("Severity", ""),
            "section": meta.get("Section", ""),
            "content": doc.page_content,
            "steps": steps,
            "distance": round(float(distance), 4),
        })
    return matches


def _vehicle_hint(vehicle: dict | None) -> dict:
    """Frontend vehicle ({make, model, year, engine, vin}) -> resolve()'s vehicle fields."""
    if not vehicle:
        return {}
    year = vehicle.get("year")
    return {
        "manufacturer": vehicle.get("make") or vehicle.get("manufacturer"),
        "model": vehicle.get("model"),
        "engine": vehicle.get("engine"),
        "year": int(year) if str(year or "").isdigit() else None,
    }


def diagnose(symptoms: str = "", fault_codes: list[str] | None = None, vehicle: dict | None = None,
             top_k: int = TOP_K, use_llm: bool = True) -> dict:
    symptoms = (symptoms or "").strip()
    codes = [c.strip() for c in (fault_codes or []) if c and c.strip()]
    obd_codes = [c.upper().replace(" ", "") for c in codes if OBD_CODE.match(c.replace(" ", ""))]
    j1939_codes = [c for c in codes if not OBD_CODE.match(c.replace(" ", ""))]

    warnings: list[str] = []
    for c in j1939_codes:
        if not extract(c, use_llm_fallback=False).codes:
            warnings.append(f"could not parse fault code {c!r}; expected J1939 like 'SPN 102 FMI 2'")
    for c in obd_codes:
        warnings.append(f"{c} is an OBD-II code; the fault-code database covers J1939 SPN/FMI only, "
                        "so it is interpreted from general knowledge")

    # SQL branch: codes go in the text so the deterministic extractor handles every format.
    raw = ". ".join(filter(None, ["; ".join(j1939_codes), symptoms]))
    sql = resolve(raw, use_llm_fallback=use_llm, vehicle_hint=_vehicle_hint(vehicle))
    warnings = sql["warnings"] + warnings

    # Vector branch analyses the SYMPTOM on its own (mixing the code's component name into
    # the query biases retrieval toward the code and blurs the separate analysis). Only
    # for a code-only query do we search on the decoded component names instead.
    components = [c["sql_result"]["sae_standard"]["spn_name"] for c in sql["codes"]
                  if c["found"] and c["sql_result"]["sae_standard"]["spn_name"]]
    retrieval_query = sql["symptom_text"] or "; ".join(components)
    matches = vector_search(retrieval_query, top_k) if retrieval_query else []
    if not matches:
        warnings.append("no service-doc matches (nothing to search on)")

    answer, relationship, cited, model = None, None, [], None
    facts_only = "\n\n".join([fault_code_section(sql, obd_codes), source_section(sql, matches)])
    if not use_llm:
        warnings.append("LLM synthesis disabled for this request")
    elif not os.environ.get("GROQ_API_KEY"):
        answer = facts_only
        warnings.append("GROQ_API_KEY not set; answer contains retrieved facts only (no analysis)")
    else:
        try:
            result = synthesize(symptoms, sql["vehicle"], sql, matches, obd_codes)
            answer, relationship, cited = result["answer"], result["relationship"], result["cited_service_docs"]
            model = result["model"]
            warnings += result["warnings"]
        except SynthesisUnavailable as exc:  # every model rate-limited / down: still return the facts
            answer = facts_only
            warnings += exc.warnings
            warnings.append("AI analysis unavailable right now; answer contains the retrieved facts only - "
                            "retry in a minute")
        except Exception as exc:
            answer = facts_only
            warnings.append(f"AI analysis failed ({type(exc).__name__}); answer contains the retrieved facts only")

    return {
        "query": symptoms,
        "retrieval_query": retrieval_query,
        "matches": matches,
        "answer": answer,
        "relationship": relationship,
        "cited_service_docs": cited,
        "model": model,               # which Groq model wrote sections 2-6 (None = facts only)
        "sql": sql,
        "obd_codes": obd_codes,
        "warnings": warnings,
    }
