// ─── Stats route ────────────────────────────────────────────────────────────
// Aggregate stats from audit log. Useful for monitoring + admin dashboards.

import express from "express";
import { auditLog } from "../utils/auditLog.js";
import { documentCache } from "../utils/cache.js";

const router = express.Router();

// GET /api/stats — aggregate counters
router.get("/", (req, res) => {
  res.json({
    audit: auditLog.stats(),
    cache: documentCache.stats(),
    request_id: req.requestId,
  });
});

// GET /api/stats/recent — recent activity
router.get("/recent", (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
  res.json({
    entries: auditLog.recent(limit),
    request_id: req.requestId,
  });
});

export default router;
