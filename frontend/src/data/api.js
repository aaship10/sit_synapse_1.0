/**
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
    topCause: diagnosis.causes[0]?.faultName ?? 'No match found',
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

function worstSeverityLevel(causes) {
  return causes.reduce((worst, c) => (SEVERITY_RANK[c.severityLevel] > SEVERITY_RANK[worst] ? c.severityLevel : worst), 'safe');
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
 * Submit a new diagnosis request. Only payload.symptoms is sent to the RAG
 * backend; vehicle/faultCodes/mileage ride along in the stored record so the
 * results page can still show them, unchanged from the mock version's contract.
 */
export async function runDiagnosis(payload) {
  const res = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: payload.symptoms }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Diagnosis request failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  const causes = groupMatchesIntoCauses(data.matches);
  const id = `rag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const diagnosis = {
    id,
    createdAt: new Date().toISOString(),
    vehicle: payload.vehicle,
    faultCodes: payload.faultCodes,
    mileage: payload.mileage,
    symptoms: data.query,
    answer: data.answer,
    severity: worstSeverityLevel(causes),
    causes,
    feedback: null,
  };

  saveDiagnosis(id, diagnosis);
  saveHistoryIndex([toSummaryRow(diagnosis), ...loadHistoryIndex()]);
  return { id };
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
