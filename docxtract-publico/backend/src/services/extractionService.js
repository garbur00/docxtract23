// ─── Extraction service ─────────────────────────────────────────────────────
// Orchestrates: per-page AI extraction → schema validation → business rules → reviewer
// Receives pages already converted to base64 (frontend handles PDF parsing for now).

import { callGemini, isGeminiConfigured } from "./geminiService.js";
import { callClaude, isClaudeConfigured } from "./claudeService.js";
import { callOpenAI, isOpenAIConfigured } from "./openaiService.js";
import {
  parseAIResponse,
  validatePageExtraction,
  validateReviewResponse,
  applyReviewToPage,
} from "./validationService.js";
import { buildExtractionPrompt, buildReviewPrompt, buildDocxExtractionPrompt } from "../utils/prompts.js";

const COST_GEMINI = 0.000075;  // per call (est. flash pricing)
const COST_CLAUDE = 0.003;
const COST_OPENAI = 0.0015;     // gpt-4o-mini est.

const CLAUDE_THRESHOLD = 0.82;
const SELECTION_KEYWORDS = ["cargo", "função", "position", "role", "sexo", "estado civil", "escolaridade", "modalidade", "tipo", "categoria"];

const isSelectionField = (name) =>
  SELECTION_KEYWORDS.some(k => (name || "").toLowerCase().includes(k));

// ─── Pick extractor based on config ─────────────────────────────────────────
export function pickExtractor(preferredProvider) {
  // Prefer Gemini (cheap, good vision), fall back to Claude, then OpenAI
  if (preferredProvider === "gemini" && isGeminiConfigured()) return "gemini";
  if (preferredProvider === "claude" && isClaudeConfigured()) return "claude";
  if (preferredProvider === "openai" && isOpenAIConfigured()) return "openai";
  if (isGeminiConfigured()) return "gemini";
  if (isClaudeConfigured()) return "claude";
  if (isOpenAIConfigured()) return "openai";
  return null;
}

// ─── Pick reviewer (different from extractor preferably) ────────────────────
export function pickReviewer(extractor) {
  // Reviewer is preferably Claude > OpenAI (better instruction-following)
  // Don't use same as extractor (less value)
  if (extractor !== "claude" && isClaudeConfigured()) return "claude";
  if (extractor !== "openai" && isOpenAIConfigured()) return "openai";
  return null;
}

// ─── Call AI by provider name ───────────────────────────────────────────────
async function callAI(provider, model, base64, mediaType, prompt) {
  if (provider === "gemini") {
    return await callGemini(model || "gemini-2.5-flash", base64, mediaType, prompt);
  }
  if (provider === "claude") {
    return await callClaude(base64, mediaType, prompt);
  }
  if (provider === "openai") {
    return await callOpenAI(base64, mediaType, prompt, model);
  }
  throw new Error(`Provider desconhecido: ${provider}`);
}

// ─── Process a single page ──────────────────────────────────────────────────
// Input:  { base64, mediaType, pageNumber, totalPages }
// Output: { ok, page: {fields,tables,...}, issues, log, cost, providers_used }
export async function extractPage(input, options = {}) {
  const {
    base64,
    mediaType,
    pageNumber,
    totalPages,
    isText = false,
    textContent = null,
  } = input;

  const {
    extractor = null,           // auto-pick if null
    reviewer = null,             // auto-pick if null; pass false to disable
    geminiModel = "gemini-2.5-flash",
    openaiModel,
  } = options;

  const log = [];
  const issues = [];
  let cost = 0;
  const providersUsed = [];

  // Pick extractor
  const chosenExtractor = extractor || pickExtractor("gemini");
  if (!chosenExtractor) {
    return {
      ok: false,
      page: null,
      issues: [{ severity: "error", src: "config", msg: "Nenhum extrator de IA configurado" }],
      log: ["Sem extrator disponível"],
      cost: 0,
      providers_used: [],
    };
  }

  // ─── Step 1: Extract ──────────────────────────────────────────────────
  const extractPrompt = isText
    ? buildDocxExtractionPrompt(textContent)
    : buildExtractionPrompt(pageNumber, totalPages);

  log.push(`[Pág ${pageNumber}] Extraindo com ${chosenExtractor}...`);
  providersUsed.push(chosenExtractor);

  let rawExtract;
  try {
    rawExtract = await callAI(
      chosenExtractor,
      chosenExtractor === "gemini" ? geminiModel : openaiModel,
      isText ? null : base64,
      isText ? null : mediaType,
      extractPrompt
    );
    cost += chosenExtractor === "gemini" ? COST_GEMINI
         : chosenExtractor === "claude" ? COST_CLAUDE
         : COST_OPENAI;
  } catch (e) {
    return {
      ok: false,
      page: null,
      issues: [{ severity: "error", src: `${chosenExtractor}:extract`, msg: e.message }],
      log: [...log, `Erro na extração: ${e.message}`],
      cost,
      providers_used: providersUsed,
    };
  }

  // ─── Step 2: Parse + Validate schema + Business rules ─────────────────
  let pageData, extractIssues;
  try {
    const parsed = parseAIResponse(rawExtract);
    const validation = validatePageExtraction(parsed, { pageNumber });
    pageData = validation.data;
    pageData.page = pageNumber;
    extractIssues = validation.issues;
    issues.push(...extractIssues);
    log.push(`[Pág ${pageNumber}] Extraído: ${pageData.fields.length} campos · ${extractIssues.length} issues`);
  } catch (e) {
    return {
      ok: false,
      page: null,
      issues: [{ severity: "error", src: "parse", msg: `Falha ao parsear JSON: ${e.message}` }],
      log: [...log, `Parse falhou: ${e.message}`],
      cost,
      providers_used: providersUsed,
    };
  }

  // ─── Step 3: Decide if reviewer needed ────────────────────────────────
  const fieldsToReview = pageData.fields.filter(f =>
    f.needs_review ||
    f.confidence < CLAUDE_THRESHOLD ||
    (isSelectionField(f.name) && f.value)
  );

  if (fieldsToReview.length === 0 || reviewer === false || isText) {
    return {
      ok: true,
      page: pageData,
      issues,
      log: [...log, fieldsToReview.length === 0
        ? `[Pág ${pageNumber}] Sem revisão necessária`
        : `[Pág ${pageNumber}] Revisão desabilitada`],
      cost,
      providers_used: providersUsed,
    };
  }

  // ─── Step 4: Reviewer ─────────────────────────────────────────────────
  const chosenReviewer = reviewer || pickReviewer(chosenExtractor);
  if (!chosenReviewer) {
    log.push(`[Pág ${pageNumber}] ${fieldsToReview.length} campos para revisar, mas sem revisor configurado`);
    issues.push({
      severity: "info",
      src: "reviewer",
      msg: `${fieldsToReview.length} campos para revisão pulados — sem revisor disponível`,
    });
    return { ok: true, page: pageData, issues, log, cost, providers_used: providersUsed };
  }

  log.push(`[Pág ${pageNumber}] Revisando ${fieldsToReview.length} campos com ${chosenReviewer}...`);
  providersUsed.push(chosenReviewer);

  try {
    const reviewPrompt = buildReviewPrompt(fieldsToReview.map(f => ({
      name: f.name,
      value: f.value,
      confidence: f.confidence,
      type: f.type,
    })));
    const rawReview = await callAI(chosenReviewer, undefined, base64, mediaType, reviewPrompt);
    cost += chosenReviewer === "claude" ? COST_CLAUDE : COST_OPENAI;

    const parsedReview = parseAIResponse(rawReview);
    const reviewValidation = validateReviewResponse(parsedReview);
    issues.push(...reviewValidation.issues);

    const { corrections, kept, cleared } = applyReviewToPage(
      pageData,
      reviewValidation.data.reviewed_fields,
      chosenReviewer
    );

    log.push(`[Pág ${pageNumber}] Revisor: ${corrections} corrigido, ${kept} mantido, ${cleared} limpo`);
  } catch (e) {
    log.push(`[Pág ${pageNumber}] Revisor falhou: ${e.message}`);
    issues.push({
      severity: "warning",
      src: `${chosenReviewer}:review`,
      msg: `Revisão falhou (página processada sem revisão): ${e.message}`,
    });
  }

  return {
    ok: true,
    page: pageData,
    issues,
    log,
    cost,
    providers_used: providersUsed,
  };
}
