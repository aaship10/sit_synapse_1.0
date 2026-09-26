/**
 * Real backend integration for the RAG diagnostic copilot (rag_pipeline/api.py).
 *
 * Same call shape as the mock runDiagnosis/getDiagnosis in mockData.js -- only
 * the `symptoms` text is actually sent to the backend (it's the only input the
 * RAG pipeline takes); vehicle/faultCodes/mileage are kept locally purely for
 * display on the results page.
 */
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8008';

const diagnosisStore = new Map();

function sessionKey(id) {
  return `diagnosis:${id}`;
}

function saveToSession(id, diagnosis) {
  try {
    sessionStorage.setItem(sessionKey(id), JSON.stringify(diagnosis));
  } catch {
    /* sessionStorage unavailable/full -- in-memory Map still covers this tab */
  }
}

function loadFromSession(id) {
  try {
    const raw = sessionStorage.getItem(sessionKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

  diagnosisStore.set(id, diagnosis);
  saveToSession(id, diagnosis);
  return { id };
}

/** Full diagnosis result by id, or null if not found (e.g. after a page reload in a new tab). */
export async function getDiagnosis(id) {
  return diagnosisStore.get(id) ?? loadFromSession(id) ?? null;
}
