// ─── Documents route ────────────────────────────────────────────────────────
// High-level endpoint for full document extraction + Excel generation.

import express from "express";
import { randomUUID } from "node:crypto";
import { extractPage, pickExtractor, pickReviewer } from "../services/extractionService.js";
import { consolidateDocument } from "../services/consolidationService.js";
import { generateExcel, applyRowEdits } from "../services/excelService.js";
import { documentCache } from "../utils/cache.js";
import { auditLog } from "../utils/auditLog.js";
import { redactSecrets } from "../utils/redactSecrets.js";

const router = express.Router();

const MAX_PAGES_PER_REQUEST = 50;

// Whitelist of accepted media types. Anything else is rejected before
// reaching the AI provider — saves cost and blocks junk uploads.
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",  // pages can still come as PDF rendered to JPEG by frontend
]);

// ─── POST /api/documents/extract ────────────────────────────────────────────
router.post("/extract", async (req, res, next) => {
  const reqId = req.requestId;
  const t0 = Date.now();
  try {
    const { document_name, pages, text_content, options = {} } = req.body;

    // Input validation
    if (!document_name || typeof document_name !== "string") {
      return res.status(400).json({ error: "Campo 'document_name' é obrigatório", request_id: reqId });
    }

    const isText = !!text_content;
    if (!isText) {
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({
          error: "Campo 'pages' deve ser um array não-vazio (ou use 'text_content' para DOCX)",
          request_id: reqId,
        });
      }
      if (pages.length > MAX_PAGES_PER_REQUEST) {
        return res.status(400).json({
          error: `Máximo de ${MAX_PAGES_PER_REQUEST} páginas por requisição. Recebido: ${pages.length}`,
          request_id: reqId,
        });
      }
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (!p || typeof p.base64 !== "string" || !p.base64) {
          return res.status(400).json({ error: `Página ${i + 1}: campo 'base64' é obrigatório`, request_id: reqId });
        }
        if (typeof p.media_type !== "string" || !p.media_type) {
          return res.status(400).json({ error: `Página ${i + 1}: campo 'media_type' é obrigatório`, request_id: reqId });
        }
        if (!ALLOWED_MEDIA_TYPES.has(p.media_type.toLowerCase())) {
          return res.status(415).json({
            error: `Tipo de arquivo não suportado em página ${i + 1}: ${p.media_type}. Aceitos: JPG, PNG, WEBP, PDF.`,
            request_id: reqId,
          });
        }
      }
    } else if (typeof text_content !== "string" || !text_content.trim()) {
      return res.status(400).json({ error: "'text_content' deve ser string não-vazia", request_id: reqId });
    }

    const extractor = pickExtractor(options.extractor);
    if (!extractor) {
      auditLog.log({ type: "extraction_failed", request_id: reqId, reason: "no_extractor" });
      return res.status(503).json({ error: "Nenhum extrator de IA configurado.", request_id: reqId });
    }
    const reviewer = options.reviewer === false ? false : pickReviewer(extractor);

    // Run pipeline
    const pageResults = [];
    const allLog = [];
    const allIssues = [];
    let totalCost = 0;
    const providersUsed = new Set();
    let failedPages = 0;

    const totalPages = isText ? 1 : pages.length;

    if (isText) {
      const result = await extractPage(
        { pageNumber: 1, totalPages: 1, isText: true, textContent: text_content },
        { extractor: options.extractor, reviewer: options.reviewer,
          geminiModel: options.gemini_model, openaiModel: options.openai_model }
      );
      allLog.push(...result.log);
      allIssues.push(...result.issues);
      totalCost += result.cost;
      result.providers_used.forEach(p => providersUsed.add(p));
      if (result.ok && result.page) pageResults.push(result.page);
      else failedPages++;
    } else {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const result = await extractPage(
          { base64: p.base64, mediaType: p.media_type, pageNumber: i + 1, totalPages: pages.length },
          { extractor: options.extractor, reviewer: options.reviewer,
            geminiModel: options.gemini_model, openaiModel: options.openai_model }
        );
        allLog.push(...result.log);
        allIssues.push(...result.issues);
        totalCost += result.cost;
        result.providers_used.forEach(p => providersUsed.add(p));
        if (result.ok && result.page) pageResults.push(result.page);
        else failedPages++;
      }
    }

    if (pageResults.length === 0) {
      auditLog.log({
        type: "extraction_failed",
        request_id: reqId,
        document_name,
        reason: "all_pages_failed",
        pages_total: totalPages,
      });
      return res.status(500).json({
        error: "Todas as páginas falharam na extração",
        issues: allIssues, log: allLog, request_id: reqId,
      });
    }

    const pipelineLabel = reviewer ? `${extractor} → ${reviewer} (revisor)` : `${extractor} (sem revisão)`;
    const consolidated = consolidateDocument(pageResults, {
      documentName: document_name,
      requestId: reqId,
      pipeline: pipelineLabel,
      totalCost,
      providersUsed: Array.from(providersUsed),
    });

    if (failedPages > 0) {
      consolidated.warnings.unshift({
        severity: "error", src: "pipeline",
        msg: `${failedPages} de ${totalPages} páginas falharam — dados podem estar incompletos`,
      });
      consolidated.errors_count += 1;
    }

    // Cache result
    const documentId = `doc_${randomUUID()}`;
    documentCache.set(documentId, consolidated);

    const elapsed = Date.now() - t0;

    // Audit log
    auditLog.log({
      type: "extraction_completed",
      request_id: reqId,
      document_id: documentId,
      document_name,
      pages_total: totalPages,
      pages_processed: pageResults.length,
      pages_failed: failedPages,
      fields_count: consolidated.fields_count,
      fields_with_value: consolidated.fields_with_value,
      overall_confidence: consolidated.overall_confidence,
      cost_usd: totalCost,
      providers: Array.from(providersUsed),
      elapsed_ms: elapsed,
    });

    return res.json({
      document_id: documentId,
      document: consolidated,
      processing: {
        elapsed_ms: elapsed,
        pages_total: totalPages,
        pages_succeeded: pageResults.length,
        pages_failed: failedPages,
        log: allLog,
      },
      request_id: reqId,
    });
  } catch (err) {
    auditLog.log({ type: "extraction_failed", request_id: reqId, reason: redactSecrets(err.message) });
    next(err);
  }
});

// ─── GET /api/documents/:id ─────────────────────────────────────────────────
router.get("/:id/excel", (req, res) => {
  // Note: this route must be defined BEFORE the generic /:id route
  res.status(501).json({ error: "Use POST /api/documents/:id/excel" });
});

// ─── POST /api/documents/:id/excel (FASE 3) ─────────────────────────────────
// Generates XLSX from cached document, optionally applying user edits.
// Body (optional): { edited_rows: [...] }
router.post("/:id/excel", (req, res) => {
  const reqId = req.requestId;
  const { id } = req.params;
  const { edited_rows } = req.body || {};

  let doc = documentCache.get(id);
  if (!doc) {
    return res.status(404).json({
      error: "Documento não encontrado ou expirado (TTL 30min). Reextraia.",
      document_id: id,
      request_id: reqId,
    });
  }

  // Apply user edits if any
  if (edited_rows) {
    doc = applyRowEdits(doc, edited_rows);
  }

  try {
    const { buffer, filename, mimetype, size_bytes } = generateExcel(doc, { clientMode: true });

    auditLog.log({
      type: "excel_generated",
      request_id: reqId,
      document_id: id,
      filename,
      size_bytes,
      had_edits: !!edited_rows,
    });

    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Document-ID", id);
    res.send(buffer);
  } catch (err) {
    console.error(`[${reqId}] Excel generation failed`);
    res.status(500).json({
      error: process.env.NODE_ENV === "production" ? "Falha ao gerar Excel" : "Falha ao gerar Excel: " + redactSecrets(err.message),
      request_id: reqId,
    });
  }
});

// ─── GET /api/documents/:id ─────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const reqId = req.requestId;
  const { id } = req.params;
  const doc = documentCache.get(id);
  if (!doc) {
    return res.status(404).json({
      error: "Documento não encontrado ou expirado (TTL 30min)",
      document_id: id,
      request_id: reqId,
    });
  }
  res.json({ document_id: id, document: doc, request_id: reqId });
});

// ─── DELETE /api/documents/:id ──────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const reqId = req.requestId;
  const { id } = req.params;
  const existed = documentCache.delete(id);
  auditLog.log({ type: "document_deleted", request_id: reqId, document_id: id, existed });
  res.json({ document_id: id, deleted: existed, request_id: reqId });
});

// ─── GET /api/documents ─────────────────────────────────────────────────────
router.get("/", (req, res) => {
  res.json({
    cache: documentCache.stats(),
    max_pages_per_request: MAX_PAGES_PER_REQUEST,
    request_id: req.requestId,
  });
});

// ─── POST /api/documents/excel (stateless) ─────────────────────────────────
// Accepts a consolidated document directly in the body and returns XLSX.
// Used by the frontend which builds its own consolidated object (no cache id).
// Body: { document: {...consolidated...} }
router.post("/excel", (req, res) => {
  const reqId = req.requestId;
  const { document } = req.body || {};

  if (!document || typeof document !== "object") {
    return res.status(400).json({
      error: "Campo 'document' (objeto consolidado) é obrigatório",
      request_id: reqId,
    });
  }

  try {
    const { buffer, filename, mimetype, size_bytes } = generateExcel(document, { clientMode: true });
    auditLog.log({
      type: "excel_generated",
      request_id: reqId,
      filename,
      size_bytes,
      source: "stateless",
    });
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error(`[${reqId}] Excel (stateless) failed`);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Falha ao gerar Excel" : "Falha ao gerar Excel: " + redactSecrets(err.message), request_id: reqId });
  }
});

export default router;
