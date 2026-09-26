"""Create the schema and load the three J1939 CSVs into Postgres (Neon).

Usage:
    python load_data.py                 # uses ./datasets
    python load_data.py --data-dir data --batch-size 5000

Re-runnable: every table is upserted on its key, so running twice does not
duplicate rows.
"""
from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from sqlalchemy import text

from db import PROJECT_ROOT, get_engine

SPN_COLUMNS = [
    "spn", "spn_name", "acronym", "units", "data_range", "operational_range",
    "operational_low", "operational_high", "resolution", "offset", "start_bit",
    "end_bit", "spn_length", "pgn_length", "transmission_rate",
]
FMI_COLUMNS = ["fmi", "fmi_meaning", "severity"]
FAULT_COLUMNS = [
    "spn", "fmi", "fault_code", "documentation_status", "source_type", "source_url",
    "spn_description", "acronym", "units", "data_range", "operational_range",
    "operational_low", "operational_high", "resolution", "offset", "start_bit",
    "end_bit", "spn_length", "pgn_length", "transmission_rate", "fmi_meaning",
    "severity", "manufacturer", "manufacturer_system", "fault_title", "description",
    "additional_descriptions", "warnings", "warning_engine_exhaust",
    "warning_personal_injury", "warning_hot_exhaust", "lamp", "engine_models",
    "manufacturer_description",
]
INT_COLUMNS = {"spn", "fmi", "start_bit", "end_bit", "spn_length"}
FLOAT_COLUMNS = {"operational_low", "operational_high", "resolution", "offset"}
MAX_RETRIES = 4
FAULT_KEY = ["spn", "fmi", "documentation_status", "manufacturer", "manufacturer_system"]


def _clean_value(value, column: str):
    """Convert pandas NaN/NA/blank strings to None, and coerce numeric types."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if value is pd.NA or value is pd.NaT:
        return None
    if column in INT_COLUMNS:
        return int(value)
    if column in FLOAT_COLUMNS:
        return float(value)
    text_value = str(value).strip()
    return text_value or None  # empty / whitespace-only -> NULL, never ''


def _rows(df: pd.DataFrame, columns: list[str]) -> list[tuple]:
    return [
        tuple(_clean_value(v, c) for v, c in zip(record, columns))
        for record in df[columns].itertuples(index=False, name=None)
    ]


def _quote(col: str) -> str:
    return f'"{col}"' if col == "offset" else col


def upsert(table: str, columns: list[str], key: list[str], rows: list[tuple],
           batch_size: int) -> None:
    col_sql = ", ".join(_quote(c) for c in columns)
    updates = ", ".join(f"{_quote(c)} = EXCLUDED.{_quote(c)}" for c in columns if c not in key)
    conflict = ("ON CONSTRAINT fault_entries_natural_key" if table == "fault_entries"
                else f"({', '.join(key)})")
    sql = f"INSERT INTO {table} ({col_sql}) VALUES %s ON CONFLICT {conflict} DO UPDATE SET {updates}"

    raw = get_engine().raw_connection()
    try:
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    with raw.cursor() as cur:
                        execute_values(cur, sql, batch, page_size=len(batch))
                    raw.commit()  # commit per batch: a dropped connection loses one batch, not all
                    break
                except (psycopg2.OperationalError, psycopg2.InterfaceError) as exc:
                    # Neon's pooler occasionally drops long-lived connections; the batch is an
                    # idempotent upsert, so reconnect and replay it.
                    if attempt == MAX_RETRIES:
                        raise
                    print(f"\n  {table}: connection lost at row {start:,} "
                          f"({type(exc).__name__}); retry {attempt}/{MAX_RETRIES - 1}")
                    raw.invalidate()
                    time.sleep(2 * attempt)
                    raw = get_engine().raw_connection()
            done = min(start + batch_size, len(rows))
            print(f"  {table}: {done:,}/{len(rows):,}", end="\r", flush=True)
        print()
    finally:
        raw.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default=str(PROJECT_ROOT / "datasets"))
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    engine = get_engine()
    with engine.begin() as conn:
        conn.exec_driver_sql((PROJECT_ROOT / "schema.sql").read_text(encoding="utf-8"))
    print("Schema ready.")

    started = time.time()

    spn = pd.read_csv(data_dir / "j1939_spn_reference.csv", encoding="utf-8")
    spn = spn.drop_duplicates("spn", keep="first")
    upsert("spn_catalog", SPN_COLUMNS, ["spn"], _rows(spn, SPN_COLUMNS), args.batch_size)

    fmi = pd.read_csv(data_dir / "j1939_fmi_reference.csv", encoding="utf-8")
    upsert("fmi_catalog", FMI_COLUMNS, ["fmi"], _rows(fmi, FMI_COLUMNS), args.batch_size)

    master = pd.read_csv(data_dir / "master_fault_dataset.csv", encoding="utf-8", low_memory=False)
    fault_rows = _rows(master, FAULT_COLUMNS)
    # Guard against duplicate natural keys inside one INSERT (Postgres rejects those).
    key_idx = [FAULT_COLUMNS.index(k) for k in FAULT_KEY]
    fault_rows = list({tuple(r[i] for i in key_idx): r for r in fault_rows}.values())
    upsert("fault_entries", FAULT_COLUMNS, FAULT_KEY, fault_rows, args.batch_size)

    print(f"Loaded in {time.time() - started:.1f}s\n\nSanity check:")
    with engine.connect() as conn:
        for table in ("spn_catalog", "fmi_catalog", "fault_entries"):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            print(f"  {table:<15} {count:>8,} rows")
        for status, n in conn.execute(text(
                "SELECT documentation_status, COUNT(*) FROM fault_entries GROUP BY 1 ORDER BY 1")):
            print(f"    documentation_status={status:<22} {n:>8,}")
        n_doc = conn.execute(text("SELECT COUNT(*) FROM fault_entries WHERE has_manufacturer_doc")).scalar_one()
        print(f"    has_manufacturer_doc=true              {n_doc:>8,}")


if __name__ == "__main__":
    main()
