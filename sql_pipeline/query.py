"""Deterministic SQL exact-match lookup for J1939 fault codes.

Public API:
    fetch_fault_code(spn, fmi, manufacturer=None) -> dict
    FaultCodeNotFoundError, SPNNotFoundError, FMINotFoundError, InvalidFaultCodeError

Result contract (every key is always present):
    {
      "spn": int, "fmi": int, "fault_code": "SPN 102 FMI 2",
      "sae_standard": {                       # generic SAE J1939 decode (baseline, always present)
          "spn_name", "acronym", "units", "data_range", "operational_range",
          "transmission_rate", "fmi_meaning", "severity",
          "in_sae_spn_catalog": bool, "in_sae_fmi_catalog": bool,
          "summary": "Engine Intake Manifold #1 Pressure - Data Erratic, ..."
      },
      "manufacturer_requested": str | None,
      "manufacturer_specific_data": bool,     # True only if manufacturer_record has real text
      "manufacturer_record": {...} | None,    # best documented record (see selection rules)
      "other_manufacturer_records": [...],    # documented text from a *different* manufacturer
      "undocumented_manufacturer_entries": [...],  # manufacturer lists the code but gives no text
      "unavailable_fields": [...],            # fields the dataset never has - do not invent them
      "notes": [str, ...],                    # plain-language caveats for the LLM synthesis step
      "source_urls": [str, ...]
    }
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from db import get_engine

MAX_SPN = 524_287  # SPN is a 19-bit field in J1939

# The source dataset has no data for these anywhere. Surfaced explicitly so the
# synthesis step reasons from general knowledge instead of claiming a procedure.
UNAVAILABLE_FIELDS = [
    "possible_causes",
    "diagnostic_steps",
    "repair_procedure",
    "warnings",
    "lamp",
]

MANUFACTURER_ALIASES = {
    "sinotruk": "SITRAK",
    "sino truk": "SITRAK",
    "sitrak": "SITRAK",
}

_CYRILLIC = re.compile(r"[Ѐ-ӿ]")


class FaultCodeNotFoundError(LookupError):
    """The SPN/FMI is unknown to both the SAE catalogs and the fault database.

    Distinct from "found but undocumented", which is a normal (non-error) result
    with manufacturer_specific_data=False.
    """

    def __init__(self, spn: int, fmi: int, message: str):
        super().__init__(message)
        self.spn = spn
        self.fmi = fmi


class SPNNotFoundError(FaultCodeNotFoundError):
    pass


class FMINotFoundError(FaultCodeNotFoundError):
    pass


class InvalidFaultCodeError(ValueError):
    """SPN/FMI is not a valid J1939 value at all (negative, non-integer, out of range)."""


def normalize_manufacturer(name: str | None) -> str | None:
    if not name or not name.strip():
        return None
    key = name.strip().lower()
    return MANUFACTURER_ALIASES.get(key, name.strip())


_LOOKUP_SQL = text("""
    SELECT fe.spn, fe.fmi, fe.fault_code, fe.documentation_status, fe.has_manufacturer_doc,
           fe.manufacturer, fe.manufacturer_system, fe.fault_title, fe.description,
           fe.engine_models, fe.source_type, fe.source_url,
           sc.spn AS catalog_spn, sc.spn_name, sc.acronym, sc.units, sc.data_range,
           sc.operational_range, sc.transmission_rate,
           fc.fmi AS catalog_fmi, fc.fmi_meaning, fc.severity
    FROM fault_entries fe
    LEFT JOIN spn_catalog sc ON sc.spn = fe.spn
    LEFT JOIN fmi_catalog fc ON fc.fmi = fe.fmi
    WHERE fe.spn = :spn AND fe.fmi = :fmi
    ORDER BY fe.has_manufacturer_doc DESC, fe.documentation_status, fe.manufacturer_system
""")


def _validate(spn: Any, fmi: Any) -> tuple[int, int]:
    if isinstance(spn, bool) or isinstance(fmi, bool) or not isinstance(spn, int) or not isinstance(fmi, int):
        raise InvalidFaultCodeError(f"SPN and FMI must be integers, got spn={spn!r}, fmi={fmi!r}")
    if not 0 <= spn <= MAX_SPN:
        raise InvalidFaultCodeError(f"SPN {spn} is outside the J1939 range 0-{MAX_SPN}")
    if fmi < 0:
        raise InvalidFaultCodeError(f"FMI {fmi} cannot be negative")
    return spn, fmi


def _raise_not_found(conn, spn: int, fmi: int) -> None:
    spn_known = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM spn_catalog WHERE spn = :s) "
             "OR EXISTS (SELECT 1 FROM fault_entries WHERE spn = :s)"), {"s": spn}).scalar_one()
    fmi_known = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM fmi_catalog WHERE fmi = :f) "
             "OR EXISTS (SELECT 1 FROM fault_entries WHERE fmi = :f)"), {"f": fmi}).scalar_one()
    if not spn_known:
        raise SPNNotFoundError(spn, fmi, f"SPN {spn} is not in the SAE SPN catalog or the fault database")
    if not fmi_known:
        raise FMINotFoundError(spn, fmi, f"FMI {fmi} is not in the SAE FMI catalog or the fault database")
    raise FaultCodeNotFoundError(spn, fmi, f"No record for the combination SPN {spn} FMI {fmi}")


def _manufacturer_record(row: dict) -> dict:
    return {
        "manufacturer": row["manufacturer"],
        "manufacturer_system": row["manufacturer_system"],
        "fault_title": row["fault_title"],
        "description": row["description"],
        "engine_models": row["engine_models"],
        "source_type": row["source_type"],
        "source_url": row["source_url"],
        "contains_non_english_text": bool(
            _CYRILLIC.search(f"{row['fault_title'] or ''} {row['description'] or ''}")),
    }


def _lookup_rows(spn: int, fmi: int, attempts: int = 2) -> list[dict]:
    # Neon suspends idle compute; the first connection while it wakes up can fail
    # with OperationalError even with pool_pre_ping. One retry covers that.
    for attempt in range(1, attempts + 1):
        try:
            with get_engine().connect() as conn:
                rows = [dict(r) for r in conn.execute(_LOOKUP_SQL, {"spn": spn, "fmi": fmi}).mappings()]
                if not rows:
                    _raise_not_found(conn, spn, fmi)
                return rows
        except OperationalError:
            if attempt == attempts:
                raise
    return []


def fetch_fault_code(spn: int, fmi: int, manufacturer: str | None = None) -> dict:
    """Look up one J1939 fault code. See module docstring for the result contract.

    Raises:
        InvalidFaultCodeError: spn/fmi not valid J1939 integers.
        SPNNotFoundError / FMINotFoundError / FaultCodeNotFoundError: unknown code.
    """
    spn, fmi = _validate(spn, fmi)
    requested = normalize_manufacturer(manufacturer)

    rows = _lookup_rows(spn, fmi)

    base = rows[0]
    in_spn_catalog = base["catalog_spn"] is not None
    in_fmi_catalog = base["catalog_fmi"] is not None
    notes: list[str] = []

    spn_label = base["spn_name"] or f"SPN {spn} (not in SAE SPN catalog; likely proprietary)"
    fmi_label = base["fmi_meaning"] or f"FMI {fmi} (non-standard FMI, not defined by SAE)"
    sae_standard = {
        "spn_name": base["spn_name"],
        "acronym": base["acronym"],
        "units": base["units"],
        "data_range": base["data_range"],
        "operational_range": base["operational_range"],
        "transmission_rate": base["transmission_rate"],
        "fmi_meaning": base["fmi_meaning"],
        "severity": base["severity"],
        "in_sae_spn_catalog": in_spn_catalog,
        "in_sae_fmi_catalog": in_fmi_catalog,
        "summary": f"{spn_label} - {fmi_label}",
    }
    if not in_spn_catalog:
        notes.append(f"SPN {spn} is not an SAE-catalogued SPN; only manufacturer data describes it.")
    if not in_fmi_catalog:
        notes.append(f"FMI {fmi} is outside the SAE-defined FMI set (0-31).")
    if in_fmi_catalog and base["severity"] is None:
        notes.append("SAE assigns no severity level to this FMI; severity is null, not unknown data.")

    documented = [r for r in rows if r["has_manufacturer_doc"]]
    blank_documented = [r for r in rows
                        if r["documentation_status"] == "documented" and not r["has_manufacturer_doc"]]

    record: dict | None = None
    others: list[dict] = []
    if requested:
        matches = [r for r in documented if (r["manufacturer"] or "").lower() == requested.lower()]
        if matches:
            record = _manufacturer_record(matches[0])
            others = [_manufacturer_record(r) for r in documented if r is not matches[0]]
        else:
            others = [_manufacturer_record(r) for r in documented]
            notes.append(f"No documented {requested}-specific fault record for SPN {spn} FMI {fmi}.")
            if others:
                makers = sorted({o["manufacturer"] for o in others})
                notes.append(
                    f"Documented records exist from other manufacturer(s) ({', '.join(makers)}); "
                    "they may use different ECU software and are provided for reference only.")
    elif documented:
        record = _manufacturer_record(documented[0])
        others = [_manufacturer_record(r) for r in documented[1:]]
        notes.append(f"Vehicle manufacturer not specified; manufacturer_record is from "
                     f"{record['manufacturer']} ({record['manufacturer_system']}).")

    manufacturer_specific = record is not None
    if not manufacturer_specific and not (requested and others):
        notes.append("No documented manufacturer-specific fault record for this code; "
                     "only the generic SAE J1939 decode is available.")
    if blank_documented:
        notes.append(
            "A manufacturer lists this code but provides no title/description: "
            + ", ".join(f"{r['manufacturer']} {r['manufacturer_system']}" for r in blank_documented) + ".")
    if record and record["contains_non_english_text"]:
        notes.append("Manufacturer description contains Russian (Cyrillic) text; translate before quoting.")
    notes.append("Dataset contains no possible causes, diagnostic steps or repair procedures; "
                 "any such guidance must come from general knowledge and be labelled as such.")

    return {
        "spn": spn,
        "fmi": fmi,
        "fault_code": f"SPN {spn} FMI {fmi}",
        "sae_standard": sae_standard,
        "manufacturer_requested": requested,
        "manufacturer_specific_data": manufacturer_specific,
        "manufacturer_record": record,
        "other_manufacturer_records": others,
        "undocumented_manufacturer_entries": [
            {"manufacturer": r["manufacturer"], "manufacturer_system": r["manufacturer_system"]}
            for r in blank_documented
        ],
        "unavailable_fields": list(UNAVAILABLE_FIELDS),
        "notes": notes,
        "source_urls": sorted({r["source_url"] for r in rows if r["source_url"]}),
    }
