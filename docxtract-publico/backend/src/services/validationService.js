// ─── Validation service ─────────────────────────────────────────────────────
// Takes raw AI output, validates against schema, applies business rules,
// returns clean validated data + list of issues.

import { PageExtractionSchema, ReviewResponseSchema, SEVERITY } from "../schemas/extraction.js";
import { safeParseAIJson } from "../utils/json.js";

const SELECTION_KEYWORDS = [
  "cargo", "função", "position", "role", "sexo",
  "estado civil", "escolaridade", "modalidade", "tipo", "categoria"
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const isSelectionField = (name) =>
  SELECTION_KEYWORDS.some(k => (name || "").toLowerCase().includes(k));

const validateCPF = (v) => {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === +d[10];
};

const validateEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// ─── Normalizers (Etapa 2) ──────────────────────────────────────────────────
// All normalizers are NON-DESTRUCTIVE: if they can't normalize with certainty,
// they keep the original value and return a warning. Empty/illegible → null.

// Treats "", "null", "n/a", "-", "ilegível" etc. as empty → null
export function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^(null|n\/?a|nao informado|não informado|ilegivel|ilegível|-+|\.+)$/i.test(s)) return null;
  return s;
}

// Brazilian phone: needs DDD + plausible number → "(DD) 99999-9999"
// ─── Field/column classification ─────────────────────────────────────────────
// Decides how a column/field should be treated based on its NAME, so we never
// normalize a material code as a phone or a delivery date as a birth date.
// Returns one of: phone | birthdate | date | money | quantity | code | email | text
export function classifyField(name) {
  const n = (name || "").toString().toLowerCase().trim();
  if (!n) return "text";

  // Phone — only these clearly indicate a phone number
  if (/(telefone|celular|whatsapp|whats|fone|contato\s*tel|\btel\b)/.test(n)) return "phone";

  // Email
  if (/(e-?mail|instagram|\binsta\b)/.test(n)) return "email";

  // Birth date — explicit birth context (enables 19xx expansion of 2-digit years)
  if (/(nascimento|nasc\.?|data\s*de\s*nasc|dt\.?\s*nasc|\bdn\b|anivers[aá]rio)/.test(n)) return "birthdate";

  // Generic date — delivery, due, issue, etc. (no birth-year guessing; future ok)
  if (/(data|dt\b|remessa|vencimento|venc\.?|emiss[aã]o|entrega|prazo|validade|compet[eê]ncia)/.test(n)) return "date";

  // Money — keep Brazilian format as-is
  if (/(pre[çc]o|valor|val\.?\s*total|\btotal\b|montante|importe|custo|r\$|unit[aá]rio)/.test(n)) return "money";

  // Quantity
  if (/(qtd|quant|quantidade|qtde|qtd\.?\s*sol)/.test(n)) return "quantity";

  // Codes / identifiers — preserve exactly (never phone/date)
  if (/(material|item|c[oó]digo|\bcod\b|\bnf\b|nota\s*fiscal|pedido|documento|\bsku\b|refer[eê]ncia|\bref\b|ncm|cfop|ean|matr[ií]cula|\bcpf\b|\bcnpj\b|\brg\b|protocolo)/.test(n)) return "code";

  return "text";
}

export function normalizePhone(raw) {
  const v = emptyToNull(raw);
  if (v === null) return { value: null, warning: null };

  const digits = v.replace(/\D/g, "");

  // Strip leading country code 55 if present (e.g. 5511999998888)
  let d = digits;
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("55")) d = d.slice(2);

  // Mobile (11 digits: DD + 9 + 8) or landline (10 digits: DD + 8)
  if (d.length === 11) {
    const ddd = d.slice(0, 2);
    const part1 = d.slice(2, 7);
    const part2 = d.slice(7);
    if (+ddd >= 11 && +ddd <= 99) {
      return { value: `(${ddd}) ${part1}-${part2}`, warning: null };
    }
    return { value: v, warning: `telefone com DDD implausível: "${v}"` };
  }
  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    const part1 = d.slice(2, 6);
    const part2 = d.slice(6);
    if (+ddd >= 11 && +ddd <= 99) {
      return { value: `(${ddd}) ${part1}-${part2}`, warning: null };
    }
    return { value: v, warning: `telefone com DDD implausível: "${v}"` };
  }

  // 8 or 9 digits = no DDD → keep original, warn
  if (d.length === 8 || d.length === 9) {
    return { value: v, warning: `telefone sem DDD: "${v}"` };
  }

  return { value: v, warning: `telefone implausível: "${v}"` };
}

// Date → "DD/MM/AAAA". If ambiguous/invalid, keep original + warning.
// opts.assumeBirthYear (default true): when true, 2-digit years are expanded
//   to 19xx/20xx (birth context) and future years are flagged as implausible.
//   When false (delivery/due dates etc.): future years are allowed, and a
//   2-digit year is treated as AMBIGUOUS — original preserved + warning.
export function normalizeDate(raw, opts = {}) {
  const { assumeBirthYear = true } = opts;
  const v = emptyToNull(raw);
  if (v === null) return { value: null, warning: null };

  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (also single-digit day/month)
  const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) {
    return { value: v, warning: `data em formato não reconhecido: "${v}"` };
  }

  let [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm;
  let year = +yyyy;

  // 2-digit year handling depends on context
  if (yyyy.length === 2) {
    if (assumeBirthYear) {
      // Birth context: 19xx if after current 2-digit boundary, else 20xx
      const cur = new Date().getFullYear() % 100;
      year = year <= cur ? 2000 + year : 1900 + year;
    } else {
      // Non-birth date with 2-digit year → ambiguous, don't guess
      return { value: v, warning: `ano com 2 dígitos ambíguo (preservado): "${v}"` };
    }
  }

  // Validity check (real calendar date)
  if (month < 1 || month > 12) {
    return { value: v, warning: `data inválida (mês ${month}): "${v}"` };
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return { value: v, warning: `data inválida (dia ${day}): "${v}"` };
  }

  // Year-range check depends on context:
  //  - birth: must be 1900..currentYear (no future births)
  //  - general date: allow a wide, sensible range incl. future (deliveries etc.)
  if (assumeBirthYear) {
    if (year < 1900 || year > new Date().getFullYear()) {
      return { value: v, warning: `ano implausível (${year}): "${v}"` };
    }
  } else {
    if (year < 1900 || year > 2100) {
      return { value: v, warning: `ano implausível (${year}): "${v}"` };
    }
  }

  const norm = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  return { value: norm, warning: null };
}

// Email/Instagram. Email → lowercase + validate. Instagram (@handle) → keep.
export function normalizeEmailOrInstagram(raw) {
  const v = emptyToNull(raw);
  if (v === null) return { value: null, warning: null };

  // Instagram handle (starts with @ or contains instagram, no @ in email sense)
  if (v.startsWith("@") || /instagram\.com/i.test(v)) {
    return { value: v, warning: null }; // don't lowercase handles forcibly
  }

  // Looks like an email
  if (v.includes("@")) {
    const lower = v.toLowerCase();
    if (validateEmail(lower)) {
      return { value: lower, warning: null };
    }
    return { value: lower, warning: `e-mail com formato suspeito: "${v}"` };
  }

  // Neither clearly email nor instagram → keep as-is
  return { value: v, warning: null };
}

// City: preserve casing exactly as written. Just trim + null-empty.
export function normalizeCity(raw) {
  return { value: emptyToNull(raw), warning: null };
}

// ─── Parse raw AI text into JSON (robust) ───────────────────────────────────
export function parseAIResponse(rawText) {
  const r = safeParseAIJson(rawText);
  if (r.ok) return r.data;
  const err = new Error(r.error || "JSON inválido retornado pela IA");
  err.code = "INVALID_AI_JSON";
  err.position = r.position;
  err.snippet = r.snippet;
  throw err;
}

// ─── Business rules per field ───────────────────────────────────────────────
function applyBusinessRules(field) {
  const issues = [];
  const value = (field.value || "").trim();

  // Rule 1: Selection fields (cargo, função) need visual evidence
  if (isSelectionField(field.name) && field.visual_evidence !== true && value) {
    issues.push({
      severity: SEVERITY.ERROR,
      src: field.name,
      msg: `Campo "${field.name}" preenchido sem evidência visual — valor removido automaticamente`
    });
    field.value = "";
    field.visual_evidence = false;
    field.validation_status = "empty_not_marked";
    field.warnings = [...(field.warnings || []), "CORREÇÃO AUTOMÁTICA: sem marcação visual"];
    field.needs_review = true;
    return issues;
  }

  if (!value) return issues;

  // Rule 2: Email format
  if (field.type === "email" && !validateEmail(value)) {
    issues.push({
      severity: SEVERITY.WARNING,
      src: field.name,
      msg: `E-mail inválido: "${value}"`
    });
    field.warnings.push("Formato de e-mail inválido");
    field.needs_review = true;
  }

  // Rule 3: CPF
  if (field.type === "cpf" && !validateCPF(value)) {
    issues.push({
      severity: SEVERITY.WARNING,
      src: field.name,
      msg: `CPF inválido: "${value}"`
    });
    field.warnings.push("CPF não passa em verificação de dígito");
    field.needs_review = true;
  }

  // Rule 4: Date sanity check
  if (field.type === "date") {
    const m = value.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
    if (m && (+m[1] > 31 || +m[2] > 12)) {
      issues.push({
        severity: SEVERITY.WARNING,
        src: field.name,
        msg: `Data suspeita: "${value}"`
      });
      field.warnings.push("Dia ou mês fora do intervalo esperado");
      field.needs_review = true;
    }
  }

  // Rule 5: Low confidence flag
  if (field.confidence < 0.65 && value) {
    issues.push({
      severity: SEVERITY.WARNING,
      src: field.name,
      msg: `Baixa confiança (${(field.confidence * 100).toFixed(0)}%) em "${field.name}"`
    });
    if (!field.needs_review) field.needs_review = true;
  }

  return issues;
}

// ─── Validate + normalize a single person (Etapa 2) ─────────────────────────
// Non-destructive: normalizes when confident, keeps original + warning otherwise.
// Returns issues array (page-level). Mutates the person object in place.
function validatePerson(person, pageNumber) {
  const issues = [];
  const personWarnings = Array.isArray(person.warnings) ? [...person.warnings] : [];

  const label = person.nome_completo
    ? `Pessoa "${person.nome_completo}"`
    : `Pessoa (pág ${pageNumber})`;

  // Telefone
  const phone = normalizePhone(person.telefone);
  person.telefone = phone.value;
  if (phone.warning) {
    personWarnings.push(phone.warning);
    issues.push({ severity: SEVERITY.WARNING, src: `${label} · telefone`, msg: phone.warning });
  }

  // Data de nascimento
  const date = normalizeDate(person.data_nascimento, { assumeBirthYear: true });
  person.data_nascimento = date.value;
  if (date.warning) {
    personWarnings.push(date.warning);
    issues.push({ severity: SEVERITY.WARNING, src: `${label} · data_nascimento`, msg: date.warning });
  }

  // E-mail / Instagram
  const contact = normalizeEmailOrInstagram(person.email_ou_instagram);
  person.email_ou_instagram = contact.value;
  if (contact.warning) {
    personWarnings.push(contact.warning);
    issues.push({ severity: SEVERITY.WARNING, src: `${label} · email_ou_instagram`, msg: contact.warning });
  }

  // Cidade (preserve casing)
  person.cidade = normalizeCity(person.cidade).value;

  // Nome (don't guess/correct — just null-empty)
  person.nome_completo = emptyToNull(person.nome_completo);
  if (person.nome_completo === null) {
    const msg = "nome_completo ausente ou ilegível";
    personWarnings.push(msg);
    issues.push({ severity: SEVERITY.WARNING, src: label, msg });
  }

  // Low confidence → warning + needs_review
  if ((person.confidence ?? 0) < 0.85) {
    issues.push({
      severity: SEVERITY.WARNING,
      src: label,
      msg: `baixa confiança (${((person.confidence ?? 0) * 100).toFixed(0)}%)`,
    });
  }

  // needs_review if low confidence OR any warning
  person.needs_review = (person.confidence ?? 0) < 0.85 || personWarnings.length > 0;
  person.warnings = personWarnings;
  person.page = pageNumber;

  return issues;
}

// ─── Main: validate page extraction ─────────────────────────────────────────
// Returns { ok, data, issues } — never throws on validation failure
export function validatePageExtraction(rawData, { pageNumber = 1 } = {}) {
  const issues = [];

  // Step 1: Schema validation via Zod
  const parsed = PageExtractionSchema.safeParse(rawData);
  if (!parsed.success) {
    // Zod errors → collect as issues but try to recover with defaults
    parsed.error.issues.forEach(err => {
      issues.push({
        severity: SEVERITY.WARNING,
        src: `schema:${err.path.join(".")}`,
        msg: `${err.path.join(".") || "raiz"}: ${err.message}`,
      });
    });

    // If we couldn't parse at all, return empty page
    if (!rawData || typeof rawData !== "object") {
      return {
        ok: false,
        data: PageExtractionSchema.parse({ page: pageNumber }),
        issues: [
          { severity: SEVERITY.ERROR, src: "schema", msg: "Resposta da IA não é um objeto JSON" }
        ],
      };
    }
  }

  // Step 2: Use parsed data (or recover with defaults)
  // Zod's .default() means even on partial failure, we get usable data
  let data;
  try {
    // Try strict parse first; fall back to coercion if needed
    data = PageExtractionSchema.parse({
      ...rawData,
      page: rawData.page || pageNumber,
      fields: Array.isArray(rawData.fields) ? rawData.fields.filter(f =>
        f && typeof f === "object" && typeof f.name === "string" && f.name.trim()
      ) : [],
      people: Array.isArray(rawData.people) ? rawData.people.filter(p =>
        p && typeof p === "object"
      ) : [],
      tables: Array.isArray(rawData.tables) ? rawData.tables.filter(t =>
        t && typeof t === "object"
      ) : [],
    });
  } catch (e) {
    // Last resort: return empty page with error
    return {
      ok: false,
      data: PageExtractionSchema.parse({ page: pageNumber }),
      issues: [
        { severity: SEVERITY.ERROR, src: "schema", msg: `Falha total no schema: ${e.message}` }
      ],
    };
  }

  // Step 3: Apply business rules per field
  data.fields.forEach(field => {
    const fieldIssues = applyBusinessRules(field);
    issues.push(...fieldIssues);
  });

  // Step 3b: Validate + normalize each person (Etapa 2)
  if (Array.isArray(data.people)) {
    data.people.forEach(person => {
      const personIssues = validatePerson(person, data.page || pageNumber);
      issues.push(...personIssues);
    });
  }

  // Step 4: Recalculate overall confidence (don't trust AI's number)
  const fieldsWithValue = data.fields.filter(f => f.value && f.value.trim());
  data.confidence_overall = fieldsWithValue.length > 0
    ? fieldsWithValue.reduce((s, f) => s + f.confidence, 0) / fieldsWithValue.length
    : 0;

  return {
    ok: issues.filter(i => i.severity === SEVERITY.ERROR).length === 0,
    data,
    issues,
  };
}

// ─── Validate review response (Claude/OpenAI revisor) ───────────────────────
export function validateReviewResponse(rawData) {
  const issues = [];
  const parsed = ReviewResponseSchema.safeParse(rawData);

  if (!parsed.success) {
    parsed.error.issues.forEach(err => {
      issues.push({
        severity: SEVERITY.WARNING,
        src: `review:${err.path.join(".")}`,
        msg: err.message,
      });
    });
    return {
      ok: false,
      data: { reviewed_fields: [] },
      issues,
    };
  }

  return {
    ok: true,
    data: parsed.data,
    issues,
  };
}

// ─── Merge review results into original page data ───────────────────────────
export function applyReviewToPage(pageData, reviewedFields, reviewerName = "claude") {
  let corrections = 0, kept = 0, cleared = 0;

  reviewedFields.forEach(rf => {
    const orig = pageData.fields.find(f => f.name === rf.name);
    if (!orig) return;

    orig.reviewed_by = reviewerName;
    orig.needs_review = false;

    if (rf.confidence != null) {
      orig.confidence = Math.max(orig.confidence || 0, rf.confidence);
    }
    if (rf.visual_evidence != null) {
      orig.visual_evidence = rf.visual_evidence;
    }

    if (rf.correction_applied === true) {
      const newVal = rf.corrected_value ?? "";
      if (newVal !== orig.value) {
        orig.value = newVal;
        corrections++;
        if (!newVal) cleared++;
      }
    } else {
      kept++;
    }

    if (rf.warnings?.length) {
      orig.warnings = [...(orig.warnings || []), ...rf.warnings];
    }
  });

  return { corrections, kept, cleared };
}

// ─── Categorize warnings by severity ────────────────────────────────────────
export function categorizeIssues(issues) {
  return {
    errors: issues.filter(i => i.severity === SEVERITY.ERROR),
    warnings: issues.filter(i => i.severity === SEVERITY.WARNING),
    info: issues.filter(i => i.severity === SEVERITY.INFO),
  };
}
