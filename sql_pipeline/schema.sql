-- =============================================================================
-- J1939 Diagnostic Copilot — SQL exact-match layer (Postgres / Neon)
--
-- Idempotent: safe to re-run. load_data.py executes this before loading.
--
-- Design notes (driven by what is actually in the CSVs):
--   * fault_entries has NO foreign keys to the catalogs on purpose. The SITRAK
--     'documented' rows use ~2,800 proprietary SPNs (e.g. 516xxx-590xxx) that
--     are not in the SAE SPN catalog, and 39 rows use non-standard FMIs (> 31).
--     Those rows are real manufacturer data, so we keep them and LEFT JOIN.
--   * (spn, fmi) is NOT unique: a code can have one generic
--     'reference_combination' row AND one 'documented' manufacturer row.
--     The natural key is (spn, fmi, documentation_status, manufacturer,
--     manufacturer_system); NULLS NOT DISTINCT (PG15+) makes it usable for
--     upserts even though manufacturer is NULL on reference rows.
--   * Columns with no data anywhere in the source (warnings, warning_*, lamp,
--     additional_descriptions, manufacturer_description) are kept for schema
--     stability but are all NULL today. There are no possible_causes /
--     diagnostic_steps columns because the source has no such data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS spn_catalog (
    spn                 INTEGER PRIMARY KEY,
    spn_name            TEXT NOT NULL,
    acronym             TEXT,
    units               TEXT,
    data_range          TEXT,
    operational_range   TEXT,
    operational_low     DOUBLE PRECISION,
    operational_high    DOUBLE PRECISION,
    resolution          DOUBLE PRECISION,
    "offset"            DOUBLE PRECISION,
    start_bit           INTEGER,
    end_bit             INTEGER,
    spn_length          INTEGER,
    pgn_length          TEXT,          -- free text in source ("8", "Variable", "9 to 1785 bytes ...")
    transmission_rate   TEXT
);

CREATE TABLE IF NOT EXISTS fmi_catalog (
    fmi                 SMALLINT PRIMARY KEY,
    fmi_meaning         TEXT NOT NULL,
    severity            TEXT           -- NULL for most FMIs: SAE assigns no severity level
);

CREATE TABLE IF NOT EXISTS fault_entries (
    id                        BIGSERIAL PRIMARY KEY,
    spn                       INTEGER NOT NULL,
    fmi                       SMALLINT NOT NULL,
    fault_code                TEXT NOT NULL,
    documentation_status      TEXT NOT NULL
        CHECK (documentation_status IN ('reference_combination', 'documented')),
    source_type               TEXT,
    source_url                TEXT,

    -- SAE decode fields as denormalised in the master file
    -- (populated on reference rows only; prefer the catalog joins)
    spn_description           TEXT,
    acronym                   TEXT,
    units                     TEXT,
    data_range                TEXT,
    operational_range         TEXT,
    operational_low           DOUBLE PRECISION,
    operational_high          DOUBLE PRECISION,
    resolution                DOUBLE PRECISION,
    "offset"                  DOUBLE PRECISION,
    start_bit                 INTEGER,
    end_bit                   INTEGER,
    spn_length                INTEGER,
    pgn_length                TEXT,
    transmission_rate         TEXT,
    fmi_meaning               TEXT,
    severity                  TEXT,

    -- Manufacturer-specific fields (documented rows only)
    manufacturer              TEXT,
    manufacturer_system       TEXT,
    fault_title               TEXT,
    description               TEXT,
    additional_descriptions   TEXT,
    warnings                  TEXT,
    warning_engine_exhaust    TEXT,
    warning_personal_injury   TEXT,
    warning_hot_exhaust       TEXT,
    lamp                      TEXT,
    engine_models             TEXT,
    manufacturer_description  TEXT,

    -- True only when there is real manufacturer text to show.
    has_manufacturer_doc      BOOLEAN GENERATED ALWAYS AS
        (documentation_status = 'documented' AND description IS NOT NULL) STORED,

    CONSTRAINT fault_entries_natural_key UNIQUE NULLS NOT DISTINCT
        (spn, fmi, documentation_status, manufacturer, manufacturer_system)
);

CREATE INDEX IF NOT EXISTS idx_fault_entries_spn_fmi      ON fault_entries (spn, fmi);
CREATE INDEX IF NOT EXISTS idx_fault_entries_fault_code   ON fault_entries (fault_code);
CREATE INDEX IF NOT EXISTS idx_fault_entries_manufacturer ON fault_entries (manufacturer);
