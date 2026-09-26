# J1939 Diagnostic Copilot — SQL exact-match branch

The deterministic half of the hybrid retrieval system. It turns raw technician text into
structured fault-code facts. Those facts are merged with the vector-DB (symptom) branch
before the Groq synthesis call.

```
raw text ─► extractor.py ─┬─► codes (regex) ──► query.fetch_fault_code() ──► Postgres (Neon)
                          ├─► vehicle (keywords → Groq fallback)
                          └─► symptom_text ───────────────────────────────► vector-DB branch
                 orchestrator.resolve() packages all of it into one stable dict
```

## Files

| File | Purpose |
|---|---|
| `schema.sql` | DDL: `spn_catalog`, `fmi_catalog`, `fault_entries` + indexes (idempotent) |
| `load_data.py` | Applies the schema and batch-upserts the three CSVs from `datasets/` |
| `db.py` | Shared SQLAlchemy engine (reads `DATABASE_URL` from `.env`) |
| `query.py` | `fetch_fault_code(spn, fmi, manufacturer=None)` and typed errors |
| `extractor.py` | Regex code extraction, vehicle entity matching, symptom-text cleanup |
| `orchestrator.py` | `resolve(raw_input)`, the contract consumed by the synthesis step |
| `tests/test_pipeline.py` | pytest suite (needs a loaded DB; two tests call Groq live) |

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env        # then fill in DATABASE_URL and GROQ_API_KEY
python load_data.py         # ~1-1.5 min on Neon; safe to re-run (upserts, retries dropped connections)
```

Expected sanity output:

```
spn_catalog        3,708 rows
fmi_catalog           32 rows
fault_entries    125,296 rows
  documented                6,640
  reference_combination   118,656
  has_manufacturer_doc=true 1,969
```

The SPN CSV has 3,820 *lines* but 3,708 *records*, because some fields contain quoted newlines.

## Run

```bash
pytest -v                   # full suite
pytest -v -s -k worked      # also prints the full resolve() JSON for the brief's example
python orchestrator.py "2018 Freightliner DD15 throwing SPN 102 FMI 2, truck has erratic power and black smoke under load"
```

## `resolve()` output contract (schema_version 1.0)

```jsonc
{
  "schema_version": "1.0",
  "input": "<raw text>",
  "codes": [{
    "spn": 102, "fmi": 2, "raw": "SPN 102 FMI 2",
    "found": true,                       // false -> sql_result null, error set
    "sql_result": {
      "fault_code": "SPN 102 FMI 2",
      "sae_standard": { "spn_name", "fmi_meaning", "severity", "units", "data_range", "summary", ... },
      "manufacturer_requested": "Freightliner",
      "manufacturer_specific_data": false,   // true ONLY with real manufacturer text
      "manufacturer_record": null,           // {manufacturer, manufacturer_system, fault_title, description, ...}
      "other_manufacturer_records": [],      // docs from a different brand (reference only)
      "undocumented_manufacturer_entries": [{"manufacturer": "SITRAK", "manufacturer_system": "CFV/EGR"}],
      "unavailable_fields": ["possible_causes", "diagnostic_steps", "repair_procedure", "warnings", "lamp"],
      "notes": ["..."],                      // caveats written for the LLM prompt
      "source_urls": ["..."]
    },
    "error": null                            // {"type": "SPNNotFoundError", "message": "..."}
  }],
  "vehicle": { "manufacturer", "model", "engine", "engine_manufacturer", "year",
               "extraction_method": "none|keyword|llm" },
  "symptom_text": "truck has erratic power and black smoke under load",
  "has_manufacturer_specific_data": false,
  "warnings": ["no manufacturer-specific data for SPN 102 FMI 2 (Freightliner); generic SAE J1939 decode only", "..."]
}
```

Keys will only be added, never renamed or removed, without bumping `schema_version`.

## Data caveats

These are handled in code. Anyone writing the synthesis prompt should still know them:

- **Only 1,969 of 125,296 rows contain manufacturer text**, all from SITRAK. Some of that text is in Russian or mixes Russian and English; it is flagged with `contains_non_english_text`.
- **SPN 102 FMI 2 has a SITRAK row with no description.** It therefore returns `manufacturer_specific_data: false` and appears in `undocumented_manufacturer_entries`.
- **No causes, diagnostic steps or warnings exist anywhere in the data.** The SQL branch never returns them, and `unavailable_fields` says so explicitly.
- **4,720 SITRAK rows use proprietary SPNs that are not in the SAE catalog, and 39 rows use FMIs above 31.** For this reason `fault_entries` has no foreign keys and lookups use LEFT JOINs. An error is raised only when a code is unknown to both the catalogs and the fault table.
- **A SITRAK record is never presented as data for another brand.** If the vehicle is a Freightliner, SITRAK text goes to `other_manufacturer_records`, and `manufacturer_specific_data` stays `false`.

## Groq

Code extraction never uses an LLM. Groq is called only when the keyword pass finds no vehicle at all, for example with misspellings like "frieghtliner cascadea". The model's answer is kept only if it can be located in the input text, so it cannot invent a vehicle. The default model is `openai/gpt-oss-120b`, because `llama-3.3-70b-versatile` returns 404 for this key. You can override it with `GROQ_MODEL` in `.env`. Pass `use_llm_fallback=False` for fully offline, deterministic runs.
