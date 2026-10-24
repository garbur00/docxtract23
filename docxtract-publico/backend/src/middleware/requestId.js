// ─── Request ID middleware ──────────────────────────────────────────────────
// Attaches a unique ID to every request — essential for debugging in production.
// Accepts X-Request-ID header from client; generates one otherwise.

function generateRequestId() {
  // Format: timestamp-random (sortable, easy to scan in logs)
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${ts}-${rand}`;
}

export function requestIdMiddleware(req, res, next) {
  // Accept incoming Request ID from client (for E2E tracing) or generate new
  const incoming = req.headers["x-request-id"];
  const reqId = (incoming && /^[a-z0-9\-]{6,64}$/i.test(incoming))
    ? incoming
    : generateRequestId();

  req.requestId = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
}
