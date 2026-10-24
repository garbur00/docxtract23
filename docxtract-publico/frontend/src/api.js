// ─── API client ──────────────────────────────────────────────────────────────
// Frontend talks ONLY to our own backend. API keys never live in the browser.

const API_BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

// ─── Access password (optional, stored in sessionStorage) ───────────────────
const ACCESS_KEY = "docxtract_access_pwd";
export const getAccessPassword  = () => sessionStorage.getItem(ACCESS_KEY) || "";
export const setAccessPassword  = (p) => sessionStorage.setItem(ACCESS_KEY, p || "");
export const clearAccessPassword = () => sessionStorage.removeItem(ACCESS_KEY);

// Inject X-Access-Password into every backend call automatically
function withAccessHeader(headers = {}) {
  const pwd = getAccessPassword();
  return pwd ? { ...headers, "X-Access-Password": pwd } : headers;
}

// Check if backend requires a password (called at app start)
export async function checkAccessStatus() {
  try {
    const r = await fetch(`${API_BASE}/api/access/status`);
    if (!r.ok) return { password_required: false, reachable: false };
    return { ...(await r.json()), reachable: true };
  } catch {
    return { password_required: false, reachable: false };
  }
}

// Validate a password without unlocking the app
export async function tryAccessLogin(password) {
  try {
    const r = await fetch(`${API_BASE}/api/access/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && data.ok === true, error: data.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Generic call to our backend's /api/process endpoint
async function fetchWithRetry(url, options, { timeout = 90000, maxRetries = 2, retryDelay = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status >= 500 || res.status === 429) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      if (e.name === "AbortError") {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(`Timeout após ${timeout/1000}s.`);
      }
      if (/Failed to fetch|NetworkError/i.test(e.message) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export async function callAI({ provider, model, base64, mediaType, prompt, textOnly = false }) {
  const res = await fetchWithRetry(`${API_BASE}/api/process`, {
    method: "POST",
    headers: withAccessHeader({ "Content-Type": "application/json" }),
    body: JSON.stringify({ provider, model, base64, mediaType, prompt, textOnly }),
  });

  if (!res.ok) {
    let errMsg = `${res.status}`;
    try { const e = await res.json(); errMsg = e.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.text;
}

// Second-attempt JSON recovery via backend (deterministic repair + AI reviewer).
// Returns the parsed object on success. Throws on failure.
export async function fixJsonViaBackend(rawText) {
  const res = await fetchWithRetry(`${API_BASE}/api/process/fix-json`, {
    method: "POST",
    headers: withAccessHeader({ "Content-Type": "application/json" }),
    body: JSON.stringify({ rawText }),
  }, { maxRetries: 0, timeout: 60000 });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Falha ao corrigir JSON (${res.status})`);
  }
  return data.data;
}

export async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return { ok: false, error: `${res.status}` };
    const data = await res.json();
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function testServerKeys() {
  try {
    const res = await fetch(`${API_BASE}/api/test-key`, { headers: withAccessHeader() });
    if (!res.ok) return { ok: false, error: `${res.status}` };
    return { ok: true, ...(await res.json()) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Generate Excel server-side from a consolidated document.
// Returns a Blob on success. Throws on failure (caller falls back to client-side).
export async function generateExcelViaBackend(document) {
  const res = await fetch(`${API_BASE}/api/documents/excel`, {
    method: "POST",
    headers: withAccessHeader({ "Content-Type": "application/json" }),
    body: JSON.stringify({ document }),
  });
  if (!res.ok) {
    let errMsg = `${res.status}`;
    try { const e = await res.json(); errMsg = e.error || errMsg; } catch {}
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  // Try to read filename from Content-Disposition
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const filename = m ? m[1] : "documento.xlsx";
  return { blob, filename };
}
