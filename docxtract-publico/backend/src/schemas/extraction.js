// ─── Zod schemas for AI extraction response ─────────────────────────────────
// Source of truth for what the AI should return.
// Used to validate + normalize JSON before processing.

import { z } from "zod";

// ─── Severity levels for warnings ───────────────────────────────────────────
export const SEVERITY = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
};

// ─── Field schema ───────────────────────────────────────────────────────────
// Each field extracted from the document
export const FieldSchema = z.object({
  name: z.string().min(1, "Campo precisa ter nome"),
  value: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  type: z.enum([
    "text", "number", "date", "checkbox", "selection",
    "email", "phone", "cpf", "cnpj", "currency"
  ]).default("text"),
  visual_evidence: z.boolean().default(false),
  validation_status: z.enum([
    "valid", "uncertain", "empty", "illegible", "empty_not_marked"
  ]).default("valid"),
  needs_review: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
  page: z.number().int().positive().optional(),
  reviewed_by: z.string().optional(),
}).passthrough(); // Allow extra fields without breaking

// ─── Table cell schema ──────────────────────────────────────────────────────
export const TableCellSchema = z.union([
  z.string(),
  z.object({
    value: z.string().default(""),
    confidence: z.number().min(0).max(1).default(1),
  }).passthrough(),
]);

// ─── Table schema ───────────────────────────────────────────────────────────
export const TableSchema = z.object({
  title: z.string().default(""),
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(TableCellSchema)).default([]),
  page: z.number().int().positive().optional(),
}).passthrough();

// ─── Person schema (Etapa 2) ────────────────────────────────────────────────
// One per person in registration forms / lists. Separate from header fields[].
// nullable() because illegible/absent values must be null (never invented).
export const PersonSchema = z.object({
  nome_completo: z.string().nullable().default(null),
  telefone: z.string().nullable().default(null),
  data_nascimento: z.string().nullable().default(null),
  cidade: z.string().nullable().default(null),
  email_ou_instagram: z.string().nullable().default(null),
  // Optional — only for registration forms that have the
  // "Caso ocupe alguma função, coloque um X" checkbox section.
  funcao_cargo: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
  // Added by validation layer (not required from AI):
  needs_review: z.boolean().default(false),
  page: z.number().int().positive().optional(),
}).passthrough();

// ─── Document type enum ─────────────────────────────────────────────────────
export const DocumentType = z.enum([
  "form", "invoice", "table", "report", "receipt",
  "list", "registration", "other"
]);

// ─── Page extraction schema ─────────────────────────────────────────────────
// One per page — what the extractor AI returns
export const PageExtractionSchema = z.object({
  page: z.number().int().positive().default(1),
  document_type: DocumentType.default("other"),
  confidence_overall: z.number().min(0).max(1).default(0),
  fields: z.array(FieldSchema).default([]),
  people: z.array(PersonSchema).default([]),       // Etapa 2 — optional, defaults to []
  tables: z.array(TableSchema).default([]),
  warnings: z.array(z.string()).default([]),
  illegible_fields: z.array(z.string()).default([]),
}).passthrough();

// ─── Review schema ──────────────────────────────────────────────────────────
// What the reviewer AI (Claude/OpenAI) returns
export const ReviewedFieldSchema = z.object({
  name: z.string(),
  original_value: z.string().default(""),
  corrected_value: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  visual_evidence: z.boolean().default(false),
  correction_applied: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
}).passthrough();

export const ReviewResponseSchema = z.object({
  reviewed_fields: z.array(ReviewedFieldSchema).default([]),
}).passthrough();

// ─── Consolidated document (what we return to frontend) ─────────────────────
export const ConsolidatedDocumentSchema = z.object({
  request_id: z.string(),
  document_name: z.string(),
  generated_at: z.string(),
  total_pages: z.number().int().positive(),
  pages_processed: z.number().int().min(0),
  fields: z.array(FieldSchema),
  tables: z.array(TableSchema),
  warnings: z.array(z.object({
    severity: z.enum(["error", "warning", "info"]),
    src: z.string(),
    msg: z.string(),
  })),
  overall_confidence: z.number().min(0).max(1),
  fields_with_value: z.number().int().min(0),
  cost_estimate_usd: z.number().min(0).default(0),
  pipeline: z.string(),
});
