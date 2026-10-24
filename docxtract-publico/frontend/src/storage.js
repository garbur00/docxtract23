// ─── localStorage persistence ────────────────────────────────────────────────
// Survives refresh. Auto-saves extraction results + user edits.

const STORAGE_KEY = "docxtract_session_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveSession(data) {
  try {
    const payload = {
      saved_at: Date.now(),
      version: 1,
      data,
    };
    const serialized = JSON.stringify(payload);
    // localStorage usually has 5-10MB limit. Skip very large payloads.
    if (serialized.length > 4 * 1024 * 1024) {
      return false;
    }
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.saved_at || !parsed.data) return null;
    // Expire old sessions
    if (Date.now() - parsed.saved_at > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      ...parsed.data,
      _meta: {
        saved_at: parsed.saved_at,
        age_minutes: Math.round((Date.now() - parsed.saved_at) / 60000),
      },
    };
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export function hasSession() {
  return loadSession() !== null;
}
