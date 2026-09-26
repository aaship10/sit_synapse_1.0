"""Step 1: Data ingestion & parsing for the Automotive Faults Dataset (Zenodo).

Confirmed schema (automotive_faults_aktc_obike_et_al.json, 99 records, a flat
JSON list, every record sharing these exact keys):

    {
      "category": "ABS System",
      "subcategory": "ABS Control Module",
      "symptoms": ["ABS warning light on", "Brake pedal pulsation"],
      "diagnosis_steps": [
        {"step": "Check ABS fuse", "result": ["Blown", "Intact"]},
        {"step": "Inspect wiring to ABS module", "result": ["Faulty wiring", "Good wiring"]}
      ]
    }

There is no free-text fault description and no severity field -- severity has
to be inferred (see metadata_tagger.py). "category" maps to System_Category
and "subcategory" is the closest thing to a Fault_Name.
"""
import json
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
from langchain_core.documents import Document

FIELD_MAP = {
    "fault_name": ["subcategory", "Fault_Name", "fault_name", "name"],
    "system_category": ["category", "System_Category", "system_category", "Category"],
    "severity": ["Severity", "severity"],
    "fault_description": ["Fault_Description", "fault_description", "description", "Description"],
    "symptoms": ["symptoms", "Symptoms", "Symptom_Description"],
    "diagnostic_procedures": [
        "diagnosis_steps",
        "Diagnostic_Procedures",
        "diagnostic_procedures",
        "Diagnostic_Steps",
        "steps",
    ],
}


def _first_present(record: Dict[str, Any], candidates: List[str], default: Any = "") -> Any:
    for key in candidates:
        if record.get(key):
            return record[key]
    return default


def _stringify_diagnosis_steps(steps: List[Dict[str, Any]]) -> str:
    """Render diagnosis_steps ([{step, result:[...]}]) as one block per step.

    Each step and its possible branch outcomes are kept on adjacent lines with
    no blank line between them, so the splitter's "\\nStep " separator can
    never cut a step apart from the very outcomes that make it a complete
    diagnostic thought.
    """
    lines = []
    for i, entry in enumerate(steps, start=1):
        if isinstance(entry, dict):
            step_text = str(entry.get("step", "")).strip()
            results = entry.get("result", [])
            if isinstance(results, list):
                outcomes = " | ".join(str(r) for r in results)
            else:
                outcomes = str(results)
            lines.append(f"Step {i}: {step_text}")
            if outcomes:
                lines.append(f"    Possible outcomes: {outcomes}")
        else:
            lines.append(f"Step {i}: {entry}")
    return "\n".join(lines)


def _stringify(value: Any) -> str:
    """Normalize a field into text, preserving structure as newlines."""
    if isinstance(value, list):
        if value and isinstance(value[0], dict) and "step" in value[0]:
            return _stringify_diagnosis_steps(value)
        return "\n".join(f"- {item}" for item in value)
    if isinstance(value, dict):
        return "\n".join(f"{k}: {v}" for k, v in value.items())
    return str(value) if value is not None else ""


def load_faults(json_path: str) -> List[Dict[str, Any]]:
    """Load the raw JSON, handling both a top-level list and a wrapped dict."""
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        for key in ("faults", "data", "records", "items"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise ValueError(
            "Unexpected JSON shape: expected a list of fault records "
            "(or a dict wrapping one). Update load_faults() for this file's shape."
        )
    return data


def faults_to_documents(records: List[Dict[str, Any]]) -> List[Document]:
    """Isolate the core textual fields and emit one Document per section.

    Keeping Fault_Description / Symptoms / Diagnostic_Procedures as separate
    Documents (rather than one concatenated blob per fault) means the splitter
    in chunk.py never fuses unrelated sections into a single chunk.
    """
    docs: List[Document] = []
    for record in records:
        fault_name = _first_present(record, FIELD_MAP["fault_name"], "Unknown Fault")
        system_category = _first_present(record, FIELD_MAP["system_category"], "Unclassified")
        severity = _first_present(record, FIELD_MAP["severity"], "Unknown")

        sections = {
            "Fault_Description": _stringify(_first_present(record, FIELD_MAP["fault_description"])),
            "Symptoms": _stringify(_first_present(record, FIELD_MAP["symptoms"])),
            "Diagnostic_Procedures": _stringify(_first_present(record, FIELD_MAP["diagnostic_procedures"])),
        }

        base_metadata = {
            "Fault_Name": fault_name,
            "System_Category": system_category,
            "Severity": severity,
        }

        for section_name, text in sections.items():
            if not text.strip():
                continue
            docs.append(
                Document(
                    page_content=text,
                    metadata={**base_metadata, "Section": section_name},
                )
            )
    return docs


def records_to_dataframe(records: List[Dict[str, Any]]) -> pd.DataFrame:
    """Flat pandas view for quick EDA (category counts, missing fields, etc.)
    before committing to the chunking/embedding steps -- not used by the
    LangChain ingestion path itself.
    """
    rows = []
    for record in records:
        rows.append(
            {
                "Fault_Name": _first_present(record, FIELD_MAP["fault_name"], "Unknown Fault"),
                "System_Category": _first_present(record, FIELD_MAP["system_category"], "Unclassified"),
                "Severity": _first_present(record, FIELD_MAP["severity"], "Unknown"),
                "num_symptoms": len(_first_present(record, FIELD_MAP["symptoms"], [])),
                "num_diagnostic_steps": len(_first_present(record, FIELD_MAP["diagnostic_procedures"], [])),
            }
        )
    return pd.DataFrame(rows)
