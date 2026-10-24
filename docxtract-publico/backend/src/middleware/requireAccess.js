// ─── Optional access-password middleware ────────────────────────────────────
// When ENABLE_ACCESS_PASSWORD=true, every protected route requires a header
// X-Access-Password equal to env ACCESS_PASSWORD. Constant-time compare to
// prevent timing attacks. No accounts, no DB — just a shared secret for
// internal company use.

import crypto from "crypto";

export function isPasswordEnabled() {
  return String(process.env.ENABLE_ACCESS_PASSWORD || "").toLowerCase() === "true";
}

export function configuredPassword() {
  return process.env.ACCESS_PASSWORD || "";
}

// Compare fixed-length digests so different password lengths also reach
// timingSafeEqual. The raw password and its digest are never persisted here.
export function safeEqual(a, b) {
  const A = crypto.createHash("sha256").update(String(a || ""), "utf8").digest();
  const B = crypto.createHash("sha256").update(String(b || ""), "utf8").digest();
  return crypto.timingSafeEqual(A, B);
}

// Middleware: deny if password is required and header is missing/wrong.
export function requireAccess(req, res, next) {
  if (!isPasswordEnabled()) return next();

  const expected = configuredPassword();
  if (!expected) {
    // Misconfiguration: enabled but no password set.
    return res.status(503).json({
      error: "Servidor configurado para exigir senha mas ACCESS_PASSWORD está vazio. Contate o administrador.",
      request_id: req.requestId,
    });
  }

  const provided = req.headers["x-access-password"] || "";
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({
      error: "Senha de acesso necessária ou inválida.",
      request_id: req.requestId,
    });
  }

  next();
}
