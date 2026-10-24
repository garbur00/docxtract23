import express from "express";
import { callGemini, isGeminiConfigured } from "../services/geminiService.js";
import { callClaude, isClaudeConfigured } from "../services/claudeService.js";
import { callOpenAI, isOpenAIConfigured } from "../services/openaiService.js";
import { safeParseAIJson, FIX_JSON_PROMPT } from "../utils/json.js";
import { redactSecrets } from "../utils/redactSecrets.js";
import {
  parseAIResponse,
  validatePageExtraction,
  validateReviewResponse,
  categorizeIssues,
} from "../services/validationService.js";

const router = express.Router();

// ─── POST /api/process ───────────────────────────────────────────────────────
// Body: { provider, model, base64, mediaType, prompt, textOnly?, validate?, pageNumber? }
//
// If validate=true (or query ?validate=true), backend will also:
//   - Parse the AI text as JSON
//   - Validate against schema (Zod)
//   - Apply business rules (CPF, email, cargo, etc.)
//   - Return validated data + categorized issues
//
// If validate=false (default), backend behaves as before — returns raw text.
// This is BACKWARD COMPATIBLE.
router.post("/", async (req, res, next) => {
  const reqId = req.requestId;
  try {
    const {
      provider,
      model,
      base64,
      mediaType,
      prompt,
      textOnly,
      validate,
      validateAs, // "page" | "review"
      pageNumber,
    } = req.body;

    const shouldValidate = validate === true || validate === "true" || req.query.validate === "true";
    const validationMode = validateAs || req.query.validateAs || "page";

    // ─── Input validation ─────────────────────────────────────────────────
    if (!provider) {
      return res.status(400).json({
        error: "Campo 'provider' é obrigatório (gemini|claude|openai)",
        request_id: reqId,
      });
    }
    if (!prompt) {
      return res.status(400).json({
        error: "Campo 'prompt' é obrigatório",
        request_id: reqId,
      });
    }
    if (!textOnly && !base64) {
      return res.status(400).json({
        error: "Campo 'base64' é obrigatório quando textOnly não está ativo",
        request_id: reqId,
      });
    }
    if (!textOnly && base64) {
      const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);
      if (!mediaType) {
        return res.status(400).json({
          error: "Campo 'mediaType' é obrigatório quando 'base64' é enviado.",
          request_id: reqId,
        });
      }
      if (!ALLOWED.has(String(mediaType).toLowerCase())) {
        return res.status(415).json({
          error: `Tipo de arquivo não suportado: ${mediaType}. Aceitos: JPG, PNG, WEBP, PDF.`,
          request_id: reqId,
        });
      }
    }
    if (base64 && base64.length > 25 * 1024 * 1024) {
      return res.status(413).json({
        error: "Imagem muito grande. Reduza o tamanho.",
        request_id: reqId,
      });
    }

    // ─── Call AI ──────────────────────────────────────────────────────────
    let rawText;
    const t0 = Date.now();

    if (provider === "gemini") {
      if (!isGeminiConfigured()) {
        return res.status(503).json({
          error: "Gemini não configurado no servidor.",
          request_id: reqId,
        });
      }
      rawText = await callGemini(model || "gemini-2.5-flash", base64, mediaType, prompt);
    } else if (provider === "claude") {
      if (!isClaudeConfigured()) {
        return res.status(503).json({
          error: "Claude não configurado no servidor.",
          request_id: reqId,
        });
      }
      rawText = await callClaude(
        textOnly ? null : base64,
        textOnly ? null : mediaType,
        prompt
      );
    } else if (provider === "openai") {
      if (!isOpenAIConfigured()) {
        return res.status(503).json({
          error: "OpenAI não configurado no servidor.",
          request_id: reqId,
        });
      }
      rawText = await callOpenAI(
        textOnly ? null : base64,
        textOnly ? null : mediaType,
        prompt,
        model
      );
    } else {
      return res.status(400).json({
        error: `Provider inválido: ${provider}. Use 'gemini', 'claude' ou 'openai'.`,
        request_id: reqId,
      });
    }

    const elapsed = Date.now() - t0;

    // ─── Optional validation ──────────────────────────────────────────────
    if (!shouldValidate) {
      return res.json({
        text: rawText,
        elapsed_ms: elapsed,
        request_id: reqId,
      });
    }

    try {
      const parsed = parseAIResponse(rawText);

      if (validationMode === "review") {
        const { ok, data, issues } = validateReviewResponse(parsed);
        const categorized = categorizeIssues(issues);
        return res.json({
          text: rawText,
          validated: ok,
          data,
          issues,
          summary: {
            errors: categorized.errors.length,
            warnings: categorized.warnings.length,
            info: categorized.info.length,
          },
          elapsed_ms: elapsed,
          request_id: reqId,
        });
      }

      const { ok, data, issues } = validatePageExtraction(parsed, {
        pageNumber: pageNumber || 1,
      });
      const categorized = categorizeIssues(issues);

      return res.json({
        text: rawText,
        validated: ok,
        data,
        issues,
        summary: {
          fields_count: data.fields.length,
          fields_with_value: data.fields.filter(f => f.value && f.value.trim()).length,
          confidence_overall: data.confidence_overall,
          errors: categorized.errors.length,
          warnings: categorized.warnings.length,
          info: categorized.info.length,
        },
        elapsed_ms: elapsed,
        request_id: reqId,
      });
    } catch (parseErr) {
      return res.json({
        text: rawText,
        validated: false,
        data: null,
        issues: [{
          severity: "error",
          src: "parse",
          msg: parseErr.message,
        }],
        elapsed_ms: elapsed,
        request_id: reqId,
      });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/process/fix-json ──────────────────────────────────────────────
// Second-attempt JSON recovery. Body: { rawText }.
// 1) Try a deterministic safe parse/repair (no AI cost).
// 2) If still broken, ask a reviewer model to fix ONLY the syntax.
//    Reviewer preference: OpenAI → Gemini → Claude (first one configured).
// Returns { ok:true, data } or { ok:false, error, position, snippet }.
router.post("/fix-json", async (req, res, next) => {
  const reqId = req.requestId;
  try {
    const { rawText } = req.body || {};
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ ok: false, error: "Campo 'rawText' é obrigatório", request_id: reqId });
    }

    // 1) deterministic recovery first (free)
    const local = safeParseAIJson(rawText);
    if (local.ok) {
      return res.json({ ok: true, data: local.data, repaired: local.repaired, via: "local", request_id: reqId });
    }

    // 2) one AI repair attempt with the first configured reviewer
    let provider = null, fixed = null;
    const prompt = FIX_JSON_PROMPT + rawText.slice(0, 60000);
    try {
      if (isOpenAIConfigured()) { provider = "openai"; fixed = await callOpenAI(null, null, prompt); }
      else if (isGeminiConfigured()) { provider = "gemini"; fixed = await callGemini("gemini-2.5-flash", null, null, prompt); }
      else if (isClaudeConfigured()) { provider = "claude"; fixed = await callClaude(null, null, prompt); }
      else {
        return res.status(503).json({ ok: false, error: "Nenhum revisor de IA configurado para corrigir o JSON.", request_id: reqId });
      }
    } catch (aiErr) {
      return res.status(502).json({ ok: false, error: `Falha na correção via IA (${provider}): ${redactSecrets(aiErr.message)}`, request_id: reqId });
    }

    const after = safeParseAIJson(fixed);
    if (after.ok) {
      return res.json({ ok: true, data: after.data, repaired: true, via: provider, request_id: reqId });
    }
    return res.status(422).json({
      ok: false, error: "JSON ainda inválido após correção da IA",
      position: after.position, snippet: after.snippet, request_id: reqId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
