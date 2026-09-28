/**
 * Real backend integration for the hybrid diagnostic copilot (backend/app.py).
 *
 * Same call shape as the mock runDiagnosis/getDiagnosis/submitFeedback in
 * mockData.js. Symptoms, fault codes and the vehicle are all sent to
 * POST /diagnose, which runs the J1939 SQL lookup + vector-DB search + Groq
 * synthesis; mileage rides along locally for display only.
 * Backend integration for the RAG diagnostic copilot (rag_pipeline/api.py).
 * This is the only source of diagnosis data in the app -- no mock/demo data.
 *
 * Only the `symptoms` text is actually sent to the backend (it's the only
 * input the RAG pipeline takes); vehicle/faultCodes/mileage ride along
 * locally purely for display.
 *
 * Diagnoses are persisted to localStorage (both the full record and a
 * lightweight history-index entry) so Dashboard/History can list them and
 * Results can reopen them later, including after the browser is closed.
 */
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8008';
const OBD_CODE = /^[PBCU][0-3][0-9A-F]{3}$/;

const DIAGNOSIS_KEY_PREFIX = 'ragDiagnosis:';
const HISTORY_INDEX_KEY = 'ragDiagnosisHistory';

const diagnosisStore = new Map();

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage unavailable/full -- in-memory Map still covers this tab */
  }
}

function saveDiagnosis(id, diagnosis) {
  diagnosisStore.set(id, diagnosis);
  safeSetItem(DIAGNOSIS_KEY_PREFIX + id, JSON.stringify(diagnosis));
}

function loadDiagnosis(id) {
  if (diagnosisStore.has(id)) return diagnosisStore.get(id);
  const raw = safeGetItem(DIAGNOSIS_KEY_PREFIX + id);
  if (!raw) return null;
  try {
    const diagnosis = JSON.parse(raw);
    diagnosisStore.set(id, diagnosis);
    return diagnosis;
  } catch {
    return null;
  }
}

function loadHistoryIndex() {
  const raw = safeGetItem(HISTORY_INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveHistoryIndex(rows) {
  safeSetItem(HISTORY_INDEX_KEY, JSON.stringify(rows));
}

function toSummaryRow(diagnosis) {
  return {
    id: diagnosis.id,
    createdAt: diagnosis.createdAt,
    vehicle: diagnosis.vehicle,
    faultCodes: diagnosis.faultCodes,
    // The decoded code is a fact; a service-doc match is only symptom similarity, so it comes second.
    topCause: diagnosis.codeResults?.[0]?.summary ?? diagnosis.causes[0]?.faultName ?? 'No match found',
    severity: diagnosis.severity,
    feedback: diagnosis.feedback,
  };
}

/** Backend Severity ("Low"|"Medium"|"High"|"Critical") -> UI level ("safe"|"warning"|"critical"). */
function toSeverityLevel(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'medium':
      return 'warning';
    case 'low':
      return 'safe';
    default:
      return 'warning';
  }
}

const SEVERITY_RANK = { safe: 1, warning: 2, critical: 3 };

/** SAE FMI severity ("Most Severe Level" etc.) -> UI level, or null when SAE assigns none. */
function fmiSeverityLevel(saeSeverity) {
  const s = (saeSeverity || '').toLowerCase();
  if (s.startsWith('most severe')) return 'critical';
  if (s.startsWith('moderately severe')) return 'warning';
  if (s.startsWith('least severe')) return 'safe';
  return null;
}

function worstSeverityLevel(causes, codeResults = []) {
  const levels = [...causes.map((c) => c.severityLevel), ...codeResults.map((c) => c.severityLevel).filter(Boolean)];
  // Nothing rated at all is not evidence of "safe".
  if (!levels.length) return 'warning';
  return levels.reduce((worst, l) => (SEVERITY_RANK[l] > SEVERITY_RANK[worst] ? l : worst), 'safe');
}

/** Flattens the SQL branch's per-code results into what the results page renders. */
function toCodeResults(sql) {
  return (sql?.codes ?? []).map((c) => {
    if (!c.found) {
      return { code: `SPN ${c.spn} FMI ${c.fmi}`, found: false, error: c.error?.message ?? 'Not found' };
    }
    const r = c.sql_result;
    return {
      code: r.fault_code,
      found: true,
      component: r.sae_standard.spn_name,
      meaning: r.sae_standard.fmi_meaning,
      summary: r.sae_standard.summary,
      saeSeverity: r.sae_standard.severity,
      severityLevel: fmiSeverityLevel(r.sae_standard.severity),
      manufacturerSpecific: r.manufacturer_specific_data,
      manufacturerRecord: r.manufacturer_record,
      otherManufacturerRecords: r.other_manufacturer_records,
      notes: r.notes,
    };
  });
}

/** Groups the flat match list (one row per Symptoms/Diagnostic_Procedures section) back into one card per fault. */
function groupMatchesIntoCauses(matches) {
  const order = [];
  const byFault = new Map();
  for (const m of matches) {
    if (!byFault.has(m.fault_name)) {
      byFault.set(m.fault_name, []);
      order.push(m.fault_name);
    }
    byFault.get(m.fault_name).push(m);
  }

  return order.map((faultName, i) => {
    const group = byFault.get(faultName);
    const symptomsMatch = group.find((m) => m.section === 'Symptoms');
    const proceduresMatch = group.find((m) => m.section === 'Diagnostic_Procedures');
    const severity = group[0].severity;

    return {
      rank: i + 1,
      faultName,
      systemCategory: group[0].system_category,
      severity,
      severityLevel: toSeverityLevel(severity),
      matchedSymptoms: symptomsMatch
        ? symptomsMatch.content
            .split('\n')
            .map((line) => line.replace(/^- /, '').trim())
            .filter(Boolean)
        : [],
      steps: proceduresMatch?.steps ?? [],
    };
  });
}

/**
 * Submit a new diagnosis request: symptoms + fault codes + vehicle go to the
 * hybrid backend; mileage rides along in the stored record for display.
 */
export async function runDiagnosis(payload) {
  const v = payload.vehicle;
  const res = await fetch(`${API_BASE}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symptoms: payload.symptoms,
      fault_codes: payload.faultCodes,
      vehicle: v ? { make: v.make, model: v.model, year: v.year, engine: v.engine, vin: v.vin } : null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Diagnosis request failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  // Show only the service-doc entries the answer actually used; the rest were judged unrelated.
  const cited = new Set(data.cited_service_docs ?? []);
  const usedMatches = data.answer && cited.size ? data.matches.filter((m) => cited.has(m.fault_name)) : data.matches;
  const causes = groupMatchesIntoCauses(usedMatches);
  const codeResults = toCodeResults(data.sql);
  const id = `rag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // No vehicle picked in the form? Use the one the backend found in the text (if any).
  const found = data.sql?.vehicle;
  const vehicle =
    payload.vehicle ??
    (found?.manufacturer
      ? { source: 'text', make: found.manufacturer, model: found.model ?? '', year: found.year ?? '', engine: found.engine ?? '' }
      : null);

  const diagnosis = {
    id,
    createdAt: new Date().toISOString(),
    vehicle,
    faultCodes: payload.faultCodes,
    mileage: payload.mileage,
    symptoms: data.query,
    answer: data.answer,
    relationship: data.relationship ?? null,
    severity: worstSeverityLevel(causes, codeResults),
    causes,
    codeResults,
    obdCodes: data.obd_codes ?? [],
    warnings: data.warnings ?? [],
    feedback: null,
  };

  saveDiagnosis(id, diagnosis);
  saveHistoryIndex([toSummaryRow(diagnosis), ...loadHistoryIndex()]);
  return { id };
}

/**
 * Decode one fault code for the code-chip preview: J1939 via the backend's
 * SQL database, OBD-II (and J1939 when the backend is unreachable) via the
 * local lookup table. Resolves to { code, component, description, ... } or null.
 */
export async function decodeFaultCode(code) {
  try {
    const res = await fetch(`${API_BASE}/decode?code=${encodeURIComponent(code)}`);
    if (res.ok) return await res.json();
    if (res.status === 404 || res.status === 422) return null;
  } catch {
    /* backend down */
  }
  return null;
}

/** Full diagnosis result by id, or null if not found. */
export async function getDiagnosis(id) {
  return loadDiagnosis(id);
}

/** All RAG diagnoses as history-table rows, newest first. */
export async function getRagDiagnosisHistory() {
  return loadHistoryIndex();
}

/** Record technician feedback for a RAG diagnosis: 'positive' | 'negative'. */
export async function submitFeedback(id, value, note = '') {
  const diagnosis = loadDiagnosis(id);
  if (diagnosis) {
    diagnosis.feedback = value;
    saveDiagnosis(id, diagnosis);
    saveHistoryIndex(loadHistoryIndex().map((row) => (row.id === id ? { ...row, feedback: value } : row)));
  }
  return { ok: true, id, value, note };
}
