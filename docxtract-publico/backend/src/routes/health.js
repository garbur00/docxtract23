import express from "express";
import { isGeminiConfigured } from "../services/geminiService.js";
import { isClaudeConfigured } from "../services/claudeService.js";
import { isOpenAIConfigured } from "../services/openaiService.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    request_id: req.requestId,
    services: {
      gemini: isGeminiConfigured() ? "configured" : "not configured",
      claude: isClaudeConfigured() ? "configured" : "not configured",
      openai: isOpenAIConfigured() ? "configured" : "not configured",
    },
    features: {
      schema_validation: "available",        // Fase 1
      request_tracing: "enabled",            // Fase 1
      env_validation: "enabled",             // Fase 1
      server_side_extraction: "available",   // Fase 2
      document_cache: "in-memory (30min TTL)",
      server_side_excel: "available",        // Fase 3
      audit_log: "in-memory (1000 entries)", // Fase 3
      aggregate_stats: "available",          // Fase 3
    },
    version: "1.3.0",
  });
});

export default router;
