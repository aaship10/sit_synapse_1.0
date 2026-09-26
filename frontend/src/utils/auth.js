/**
 * Auth client for the DiagnosticIQ backend (rag_pipeline/auth/, FastAPI + Neon
 * Postgres). login()/signup() hit the real API and persist the session
 * (JWT + user info) to localStorage; getSession()/logout() are synchronous
 * reads/clears of that local copy so the rest of the app (Header,
 * RequireAuth, ...) doesn't need to change when auth moves between backends.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8010';
const SESSION_KEY = 'diagnosticiq_session';

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore — session simply won't persist across reloads.
  }
}

/** Pulls a readable message out of a FastAPI error body.
 * `detail` is a string for our own HTTPExceptions, or an array of
 * { msg, loc, ... } for pydantic validation errors (422). */
function extractErrorMessage(body, fallback) {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => d.msg).join(' ');
  }
  return fallback;
}

async function postJSON(path, payload) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Could not reach the server. Is the auth API running?');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(extractErrorMessage(body, `Request failed (${res.status}).`));
  }
  return body;
}

/** { name, email, shop } of the signed-in user, or null. Safe during render. */
export function getSession() {
  const session = readSession();
  if (!session) return null;
  const { name, email, shop } = session;
  return { name, email, shop };
}

/** Bearer token for authenticated requests to the backend, or null. */
export function getToken() {
  return readSession()?.token ?? null;
}

/** Throws Error('Invalid email or password.') on failure. */
export async function login({ email, password }) {
  const { token, user } = await postJSON('/api/auth/login', { email, password });
  writeSession({ token, ...user });
  return user;
}

/** Throws on validation errors or Error('An account with this email already exists.'). */
export async function signup({ name, email, shop, password }) {
  const { token, user } = await postJSON('/api/auth/signup', { name, email, shop, password });
  writeSession({ token, ...user });
  return user;
}

export function logout() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
