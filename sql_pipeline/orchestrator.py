"""Orchestration contract for the SQL branch.

    resolve(raw_input: str, use_llm_fallback: bool = True) -> dict

The returned dict is merged with the vector-DB branch's results before the Groq
synthesis call. Its shape is a contract (teammate code depends on it) - add
keys if needed, never rename or remove them:

{
  "schema_version": "1.0",
  "input": str,                          # raw technician text, unchanged
  "codes": [                             # one per unique (spn, fmi), in input order; [] if none
    {
      "spn": int,
      "fmi": int,
      "raw": str,                        # the text the code was parsed from
      "found": bool,                     # False -> sql_result is None, see "error"
      "sql_result": dict | None,         # query.fetch_fault_code() result
      "error": None | {"type": str, "message": str}
    }
  ],
  "vehicle": {
    "manufacturer": str | None, "model": str | None, "engine": str | None,
    "engine_manufacturer": str | None, "year": int | None,
    "extraction_method": "none" | "keyword" | "llm" | "provided"
  },
  "symptom_text": str,                   # input minus codes / vehicle; send this to the vector DB
  "has_manufacturer_specific_data": bool,  # True if ANY code has a manufacturer record
  "warnings": [str]                      # human-readable caveats, safe to pass to the LLM prompt
}
"""
from __future__ import annotations

import json
import sys

from extractor import extract
from query import FaultCodeNotFoundError, InvalidFaultCodeError, fetch_fault_code

SCHEMA_VERSION = "1.0"


VEHICLE_FIELDS = ("manufacturer", "model", "engine", "engine_manufacturer", "year")


def resolve(raw_input: str, use_llm_fallback: bool = True, vehicle_hint: dict | None = None) -> dict:
    """vehicle_hint: structured vehicle from the UI (e.g. dropdown / VIN decode). Any
    non-empty field overrides what was extracted from the text, and is used for the
    manufacturer-specific lookup. When given, the Groq vehicle fallback is skipped."""
    hint = {k: v for k, v in (vehicle_hint or {}).items() if k in VEHICLE_FIELDS and v not in (None, "")}
    extraction = extract(raw_input, use_llm_fallback=use_llm_fallback and not hint)
    vehicle = {**extraction.vehicle, **hint}
    warnings: list[str] = list(extraction.notes)

    codes = []
    for code in extraction.codes:
        spn, fmi = code["spn"], code["fmi"]
        entry = {"spn": spn, "fmi": fmi, "raw": code["raw"], "found": True,
                 "sql_result": None, "error": None}
        try:
            result = fetch_fault_code(spn, fmi, manufacturer=vehicle["manufacturer"])
        except (FaultCodeNotFoundError, InvalidFaultCodeError) as exc:
            entry["found"] = False
            entry["error"] = {"type": type(exc).__name__, "message": str(exc)}
            warnings.append(f"SPN {spn} FMI {fmi} not found: {exc}")
        else:
            entry["sql_result"] = result
            if not result["manufacturer_specific_data"]:
                who = f" ({result['manufacturer_requested']})" if result["manufacturer_requested"] else ""
                warnings.append(f"no manufacturer-specific data for SPN {spn} FMI {fmi}{who}; "
                                "generic SAE J1939 decode only")
        codes.append(entry)

    if not codes:
        warnings.append("no fault codes found in input; symptom-only query (vector-DB branch only)")
    if codes and any(c["found"] for c in codes):
        warnings.append("SQL branch has no possible causes or repair steps for any code; "
                        "such guidance must come from the vector-DB branch or general knowledge")

    vehicle["extraction_method"] = "provided" if hint else extraction.vehicle_extraction_method
    return {
        "schema_version": SCHEMA_VERSION,
        "input": raw_input,
        "codes": codes,
        "vehicle": vehicle,
        "symptom_text": extraction.symptom_text,
        "has_manufacturer_specific_data": any(
            c["sql_result"] and c["sql_result"]["manufacturer_specific_data"] for c in codes),
        "warnings": warnings,
    }


if __name__ == "__main__":
    text = " ".join(sys.argv[1:]) or input("Technician input: ")
    print(json.dumps(resolve(text), indent=2, ensure_ascii=False))
