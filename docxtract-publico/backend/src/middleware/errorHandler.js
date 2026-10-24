// Global error handler — production 5xx responses and logs omit error details.
// Logging policy:
//   - Known operational errors (CORS, payload too large, bad JSON, any 4xx):
//     a single concise log line (no stack) — these are routine and would
//     otherwise flood the logs (e.g. bots hitting the API from blocked origins).
//   - Unexpected errors (5xx / no known type): status only in production;
//     redacted details in development for debugging.
import { redactSecrets } from "../utils/redactSecrets.js";

export function errorHandler(err, req, res, _next) {
  const reqId = req.requestId || "no-id";
  const shortLog = (label) => console.warn(`[${label}] [${reqId}] ${redactSecrets(err.message || err)}`);

  // CORS errors (routine — bots/other origins) → one line, no stack
  if (err.message && err.message.includes("not allowed by CORS")) {
    shortLog("CORS");
    return res.status(403).json({ error: "Origem não permitida", request_id: reqId });
  }

  // Payload too large
  if (err.type === "entity.too.large") {
    shortLog("PAYLOAD");
    return res.status(413).json({ error: "Arquivo muito grande. Limite: 25MB.", request_id: reqId });
  }

  // Body parser errors
  if (err.type === "entity.parse.failed") {
    shortLog("BADJSON");
    return res.status(400).json({ error: "JSON inválido no body da requisição", request_id: reqId });
  }

  // Default
  const status = err.status || 500;

  // Other client errors (4xx) → short line. Production 5xx → status only.
  if (status < 500) {
    shortLog(`HTTP${status}`);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.error(`[ERROR] [${reqId}] status=${status}`);
    } else {
      console.error(`[ERROR] [${reqId}]`, redactSecrets(err.stack || err.message || err));
    }
  }

  const message = process.env.NODE_ENV === "production"
    ? (status < 500 ? err.message : "Erro interno do servidor")
    : err.message;

  res.status(status).json({ error: redactSecrets(message), request_id: reqId });
}
