// ─── Access route ────────────────────────────────────────────────────────────
// GET  /api/access/status  → tells the frontend if a password is required
// POST /api/access/login   → validates a password (used to unlock the UI)
//
// No accounts, no sessions on server. The frontend stores the password in
// sessionStorage and sends X-Access-Password on every request.

import express from "express";
import { isPasswordEnabled, safeEqual, configuredPassword } from "../middleware/requireAccess.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

// PUBLIC — frontend needs this BEFORE login to know whether to show the gate.
router.get("/status", (req, res) => {
  res.json({
    password_required: isPasswordEnabled(),
    request_id: req.requestId,
  });
});

// PUBLIC — checks if a password is correct without touching protected routes.
// Body: { password: "..." }
router.post("/login", loginLimiter, (req, res) => {
  if (!isPasswordEnabled()) {
    return res.json({ ok: true, password_required: false, request_id: req.requestId });
  }
  const expected = configuredPassword();
  const provided = (req.body && req.body.password) || "";
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: "Servidor exige senha mas ACCESS_PASSWORD não foi configurada.",
      request_id: req.requestId,
    });
  }
  if (safeEqual(provided, expected)) {
    return res.json({ ok: true, request_id: req.requestId });
  }
  return res.status(401).json({ ok: false, error: "Senha inválida.", request_id: req.requestId });
});

export default router;
