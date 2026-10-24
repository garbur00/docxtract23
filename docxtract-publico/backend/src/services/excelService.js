// ─── Excel service ──────────────────────────────────────────────────────────
// Generates XLSX (binary Buffer) from a consolidated document JSON.
// Ported from the original frontend logic — same multi-sheet structure.

import * as XLSX from "xlsx";
import {
  normalizePhone,
  normalizeDate,
  normalizeEmailOrInstagram,
  normalizeCity,
  emptyToNull,
  classifyField,
} from "./validationService.js";

const CONFIDENCE_HIGH = 0.85;
const CONFIDENCE_MED = 0.65;

const sanitizeSheetName = (n) =>
  (n || "Sheet").replace(/[\\/?*[\]:]/g, " ").substring(0, 31).trim() || "Sheet";

const sanitizeFilename = (n) => {
  const cleaned = (n || "documento")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100) || "documento";
  // Strip existing common extensions to avoid foo.pdf.xlsx
  return cleaned.replace(/\.(pdf|jpe?g|png|webp|docx?|xlsx)$/i, "");
};

// ─── Fallback: extract people[] from numbered fields[] ──────────────────────
// Real-world AI sometimes returns numbered fields ("Nome completo (1)") instead
// of a proper people[]. This function reconstructs the people structure AND
// applies normalization (phone, date, email) so the Excel output is clean.
//
// Recognizes (case-insensitive). The index can appear as:
//   _1, -1, " 1", "1" (no separator), or "(1)" with parentheses.
//
// Field name aliases:
//   Nome completo, Nome
//   Telefone com DDD, Telefone, Tel, Celular, Fone, Whatsapp, Whats
//   Cidade, Município
//   Data de nascimento, Data nasc(imento), Nascimento, DN, Data
//   E-mail ou instagram, E-mail, Email, Instagram, Insta, Contato
//
// Separator group: \s*[\s_\-]*\(?(\d+)\)?\s*$
//   - any whitespace, then optional _ - or space, then optional "(", digits, optional ")"
const NUM_TAIL = String.raw`\s*[\s_\-]*\(?(\d+)\)?\s*$`;
const PEOPLE_FIELD_PATTERNS = [
  // "Nome Cônjuge (1)" / "Noivo (1)" / "Paciente (1)" etc. são o NOME da pessoa
  // (vistos em runs reais: certidão de casamento e relatório de pacientes).
  // "Nome da Mãe (1)" NÃO casa (vira extra).
  { key: "nome_completo",      re: new RegExp(`^(nome\\s*completo|nome\\s*(do\\s*|da\\s*)?(c[oô]njuge|noivo|noiva|paciente)|c[oô]njuge|noivo|noiva|paciente|nome)${NUM_TAIL}`, "i") },
  { key: "telefone",           re: new RegExp(`^(telefone(\\s*com\\s*ddd)?|tel|celular|fone|whatsapp|whats)${NUM_TAIL}`, "i") },
  { key: "cidade",             re: new RegExp(`^(cidade|munic[ií]pio)${NUM_TAIL}`, "i") },
  { key: "data_nascimento",    re: new RegExp(`^(data\\s*de\\s*nascimento|data\\s*nasc(imento)?|nascimento|dn|data)${NUM_TAIL}`, "i") },
  { key: "email_ou_instagram", re: new RegExp(`^(e-?mail(\\s*ou\\s*instagram)?|email|instagram|insta|contato)${NUM_TAIL}`, "i") },
];

// ─── Função/Cargo (candidate-registration forms only) ───────────────────────
// Section "Caso ocupe alguma função, coloque um X" with these options.
// Detection is OPT-IN: only triggers when the page actually has these fields,
// so material/invoice/table documents are never affected.
const ROLE_LABELS = [
  { label: "Pré-Cand. a Vereador", re: /pr[eé]-?\s*cand\.?\s*(a|à)?\s*vereador/i },
  { label: "Pré-Cand. a Prefeito", re: /pr[eé]-?\s*cand\.?\s*(a|à)?\s*prefeito/i },
  { label: "Secretário Municipal", re: /secret[aá]rio\s*municipal/i },
  { label: "Liderança Política",   re: /lideran[çc]a\s*pol[ií]tica/i },
  { label: "Vereador",             re: /vereador/i },   // checked after "pré-cand"
  { label: "Prefeito",             re: /prefeito/i },
];
// Ancorada no FIM: "Cargo (1)" sim; "Cargo Juíza de Direito" NÃO (run real com
// averbação de divórcio: o cargo da juíza virava Função/Cargo da pessoa 1).
const ROLE_GROUP_RE = /^(fun[çc][aã]o(\s*\/?\s*cargo)?|cargo)\s*$/i;

function matchRoleLabel(base) {
  for (const { label, re } of ROLE_LABELS) if (re.test(base)) return label;
  return null;
}
function isRoleMarked(f) {
  if (f && f.visual_evidence === true) return true;
  const v = (f && f.value != null ? String(f.value) : "").trim();
  if (!v) return false;
  return /^(x+|✓|✔|☑|sim|s|marcado|true|1|●|■|\[x\]|\(x\))$/i.test(v);
}
function splitNumTail(name) {
  const m = name.match(/[\s_\-]*\(?(\d+)\)?\s*$/);
  if (m && m.index > 0) return { base: name.slice(0, m.index).trim(), idx: m[1] };
  return { base: name.trim(), idx: "1" };
}
// Detect a role for a field. Returns canonical label or null.
function roleFromField(f) {
  const name = (f.name || "").trim();
  if (!name) return null;
  const { base } = splitNumTail(name);
  const labelHit = matchRoleLabel(base);
  if (labelHit) return isRoleMarked(f) ? labelHit : null;     // checkbox option
  if (ROLE_GROUP_RE.test(base)) {                              // single "Função" field
    const v = (f.value ?? "").toString().trim();
    if (!v) return null;
    return matchRoleLabel(v) || (v.length <= 40 ? v : null);
  }
  return null;
}
// True when the document has the function/role section at all.
function hasRoleSection(fields) {
  return Array.isArray(fields) && fields.some(f => {
    const name = (f.name || "").trim();
    if (!name) return false;
    const { base } = splitNumTail(name);
    return matchRoleLabel(base) !== null || ROLE_GROUP_RE.test(base);
  });
}

// ─── Colapsa campos-extra de LISTA repetida numa única coluna ────────────────
// Quando uma pessoa tem MUITOS extras que só diferem por um número no fim
// ("Alteração 1", "Alteração 2", … visto em relatório real do SUS: 11 colunas
// de log de auditoria, vazias para as outras pessoas), junta todos numa coluna
// só ("Alteração" = "v1 | v2 | …"), ordenada pelo número. Listas pequenas
// (< COLLAPSE_MIN) ficam como colunas separadas. Nenhum dado é perdido.
const COLLAPSE_MIN = 5;
export function collapseSequentialExtras(extra) {
  if (!extra || typeof extra !== "object") return extra || {};
  const groups = new Map();  // base → [{ n, key }]
  for (const key of Object.keys(extra)) {
    const m = key.match(/^(.+?)\s+(\d+)$/);
    if (!m) continue;
    const base = m[1].trim();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ n: +m[2], key });
  }
  const merged = new Map();   // base → valor juntado
  const absorbed = new Set(); // keys que somem
  for (const [base, items] of groups) {
    if (items.length < COLLAPSE_MIN) continue;
    items.sort((a, b) => a.n - b.n);
    merged.set(base, items.map(it => extra[it.key]).filter(v => v != null && String(v).trim() !== "").join(" | "));
    items.forEach(it => absorbed.add(it.key));
  }
  if (!merged.size) return extra;
  const out = {};
  const emitted = new Set();
  for (const key of Object.keys(extra)) {
    if (!absorbed.has(key)) { out[key] = extra[key]; continue; }
    const base = key.match(/^(.+?)\s+(\d+)$/)[1].trim();
    if (!emitted.has(base)) { out[base] = merged.get(base); emitted.add(base); }
  }
  return out;
}

// Une chaves de extra_fields de várias pessoas de forma case-insensitive
// ("Mãe"/"mãe"/"MÃE" → uma coluna; rótulo = variante com mais maiúsculas) E
// ENXUGA colunas de cauda-longa: quando há MUITOS registros (≥ FOLD_MIN) e uma
// coluna aparece em pouquíssimos deles (< 5%), ela some da grade e seu conteúdo
// vai para uma coluna única "Outros dados" (rótulo: valor | …). NADA é perdido.
// Documento pequeno mantém TODAS as colunas. Genérico p/ qualquer documento.
// Espelha _mergeExtraColumns do frontend.
const FOLD_MIN_PEOPLE = 20;
const RARE_FILL_PCT = 0.05;
export const OUTROS_KEY = "__outros__";
// Chave de agrupamento SEGURA: ignora caixa, ACENTOS e pontuação/abreviação,
// mas respeita letras diferentes. Junta "Frequência Esc."="Frequencia Esc.",
// NUNCA junta grafias com letras trocadas ("Frequenda"≠"Frequência").
const _canonKey = (s) => String(s).trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   // remove acentos
  .replace(/[.\-_/]+/g, " ").replace(/\s+/g, " ").trim();
const _accents = (s) => (String(s).normalize("NFD").match(/[̀-ͯ]/g) || []).length;
const _upper = (s) => (String(s).match(/[A-ZÀ-Þ]/g) || []).length;
const _labelScore = (s) => _upper(s) + _accents(s);   // prefere rótulo c/ acento e maiúscula
export function mergeExtraColumns(people) {
  const canon = new Map();   // canonKey → { label, order, fill }
  let order = 0;
  for (const p of people) {
    const ex = p && p.extra_fields;
    if (!ex || typeof ex !== "object") continue;
    for (const k of Object.keys(ex)) {
      const ck = _canonKey(k);
      if (!ck) continue;
      const filled = ex[k] != null && String(ex[k]).trim() !== "";
      const cur = canon.get(ck);
      if (!cur) canon.set(ck, { label: k.trim(), order: order++, fill: filled ? 1 : 0 });
      else { if (_labelScore(k.trim()) > _labelScore(cur.label)) cur.label = k.trim(); if (filled) cur.fill++; }
    }
  }
  const entries = [...canon.entries()].sort((a, b) => a[1].order - b[1].order);
  const valueOf = (p, ck) => {
    const ex = p && p.extra_fields;
    if (!ex || typeof ex !== "object") return "";
    let fallback = "";
    for (const [k, v] of Object.entries(ex)) {
      if (_canonKey(k) !== ck) continue;
      const s = v == null ? "" : v;
      if (String(s).trim() !== "") return s;
      fallback = s;
    }
    return fallback;
  };
  // Enxugar: identifica colunas raras (só quando há registros suficientes)
  const limiar = Math.max(2, Math.ceil(people.length * RARE_FILL_PCT));
  const raras = people.length >= FOLD_MIN_PEOPLE
    ? entries.filter(([, v]) => v.fill < limiar).map(([lk]) => lk) : [];
  if (!raras.length) {
    return { keys: entries.map(([lk]) => lk), labels: entries.map(([, v]) => v.label), valueOf };
  }
  const rareSet = new Set(raras);
  const comuns = entries.filter(([lk]) => !rareSet.has(lk));
  const rareEntries = entries.filter(([lk]) => rareSet.has(lk));
  const labelByKey = new Map(entries.map(([lk, v]) => [lk, v.label]));
  const outrosOf = (p) => rareEntries.map(([lk]) => { const v = valueOf(p, lk); return (v != null && String(v).trim() !== "") ? `${labelByKey.get(lk)}: ${v}` : null; }).filter(Boolean).join(" | ");
  return {
    keys: [...comuns.map(([lk]) => lk), OUTROS_KEY],
    labels: [...comuns.map(([, v]) => v.label), "Outros dados"],
    valueOf: (p, lk) => lk === OUTROS_KEY ? outrosOf(p) : valueOf(p, lk),
  };
}

export function extractPeopleFromNumberedFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return [];

  // ─── BUG FIX (multi-page): the AI restarts indexing at (1) on every page,
  // so grouping by index alone collapses people from different pages into one.
  // We must group by `${page}|${idx}` to keep one entry per (page, index) pair.
  const byKey = new Map();

  fields.forEach(f => {
    const name = (f.name || "").trim();
    if (!name) return;
    let matchedPerson = false;
    for (const { key, re } of PEOPLE_FIELD_PATTERNS) {
      const m = name.match(re);
      if (m) {
        const idx = m[m.length - 1];          // numbered index "1", "2", ...
        const pageNum = f.page || 1;
        const composite = `p${pageNum}|i${idx}`;  // ← composite key
        if (!byKey.has(composite)) {
          byKey.set(composite, {
            _raw: {},
            _confidences: [],
            page: pageNum,
            _idx: Number(idx),
          });
        }
        const entry = byKey.get(composite);
        const rawVal = (f.value ?? "").toString().trim();
        if (entry._raw[key] === undefined || (!entry._raw[key] && rawVal)) {
          entry._raw[key] = rawVal;
        }
        if (typeof f.confidence === "number") entry._confidences.push(f.confidence);
        matchedPerson = true;
        break;
      }
    }
    if (matchedPerson) return;
    // Não é campo de pessoa → pode ser checkbox de Função/Cargo (mesmo índice).
    const role = roleFromField(f);
    if (role) {
      const { idx } = splitNumTail(name);
      const pageNum = f.page || 1;
      const composite = `p${pageNum}|i${idx}`;
      if (!byKey.has(composite)) {
        byKey.set(composite, { _raw: {}, _confidences: [], page: pageNum, _idx: Number(idx) });
      }
      const entry = byKey.get(composite);
      if (!entry._roles) entry._roles = [];
      if (!entry._roles.includes(role)) entry._roles.push(role);
      return;
    }
    // Campo numerado que não é dos 5 conhecidos nem Função/Cargo → campo EXTRA
    // da pessoa (Pai, Mãe, Endereço, CEP, CPF, RG, SUS, …). Sem isto, esses
    // dados eram descartados no pivot (perda diagnosticada em produção com
    // fichas de cadastro que têm muito mais que 5 campos por pessoa).
    // Exige índice numérico REAL no nome (m.index > 0) para nunca capturar
    // campos de cabeçalho não numerados.
    const mTail = name.match(/[\s_\-]*\(?(\d+)\)?\s*$/);
    if (mTail && mTail.index > 0) {
      const base = name.slice(0, mTail.index).trim();
      // Selos/carimbos são elementos do DOCUMENTO: a IA os numera por existirem
      // vários, mas não pertencem a pessoa alguma (run real: "Cartório Selo (1)"
      // contaminava a pessoa 1). Ficam fora do pivot → saem na aba Dados.
      if (/\b(selo|carimbo)\b/i.test(base)) return;
      const rawVal = (f.value ?? "").toString().trim();
      if (base && rawVal) {
        const idx = mTail[1];
        const pageNum = f.page || 1;
        const composite = `p${pageNum}|i${idx}`;
        if (!byKey.has(composite)) {
          byKey.set(composite, { _raw: {}, _confidences: [], page: pageNum, _idx: Number(idx) });
        }
        const entry = byKey.get(composite);
        if (!entry._extra) entry._extra = {};
        if (entry._extra[base] === undefined || !entry._extra[base]) entry._extra[base] = rawVal;
        if (typeof f.confidence === "number") entry._confidences.push(f.confidence);
      }
    }
  });

  // Sort by page first, then by index within the page (stable order across pages)
  const sortedKeys = Array.from(byKey.keys()).sort((a, b) => {
    const ea = byKey.get(a), eb = byKey.get(b);
    if (ea.page !== eb.page) return ea.page - eb.page;
    return ea._idx - eb._idx;
  });

  const people = [];
  for (const k of sortedKeys) {
    const entry = byKey.get(k);
    const raw = entry._raw;
    const warnings = [];

    // Normalize (non-destructive: keeps original + warning if can't normalize)
    const phone = normalizePhone(raw.telefone);
    const date = normalizeDate(raw.data_nascimento, { assumeBirthYear: true });
    const contact = normalizeEmailOrInstagram(raw.email_ou_instagram);

    // Build warning objects with full context (for the Avisos sheet)
    if (phone.warning) {
      warnings.push({
        field: "telefone",
        original: raw.telefone ?? "",
        problem: phone.warning,
      });
    }
    if (date.warning) {
      warnings.push({
        field: "data_nascimento",
        original: raw.data_nascimento ?? "",
        problem: date.warning,
      });
    }
    if (contact.warning) {
      warnings.push({
        field: "email_ou_instagram",
        original: raw.email_ou_instagram ?? "",
        problem: contact.warning,
      });
    }

    const nome = emptyToNull(raw.nome_completo);
    const cidade = normalizeCity(raw.cidade).value;

    // Missing name → needs review (but no warning entry for empty optional fields)
    if (nome === null) {
      warnings.push({
        field: "nome_completo",
        original: "",
        problem: "nome ausente ou ilegível",
      });
    }

    // Confidence = mean of per-field confidences from the AI
    const confidence = entry._confidences.length
      ? entry._confidences.reduce((s, c) => s + c, 0) / entry._confidences.length
      : 0;

    // needs_review per spec: any warning OR low confidence OR missing name
    const needs_review =
      warnings.length > 0 ||
      confidence < CONFIDENCE_HIGH ||
      nome === null;

    // Final person — keep warning STRINGS in .warnings (for Pessoas sheet column)
    // and detailed objects in ._warning_details (for Avisos sheet)
    people.push({
      nome_completo: nome,
      telefone: phone.value,
      cidade,
      data_nascimento: date.value,
      email_ou_instagram: contact.value,
      funcao_cargo: (entry._roles && entry._roles.length) ? entry._roles.join(", ") : null,
      // Campos extras da ficha (Pai, Mãe, Endereço, CPF, SUS, …) preservados
      // como { "Nome do campo": valor } — viram colunas dinâmicas no Excel.
      // Listas repetidas longas ("Alteração 1..N") são colapsadas numa coluna.
      extra_fields: collapseSequentialExtras(entry._extra || {}),
      confidence: Number(confidence.toFixed(2)),
      needs_review,
      warnings: warnings.map(w => `${w.field}: ${w.problem}`),
      _warning_details: warnings,    // used by Avisos sheet
      page: entry.page,
    });
  }

  return people;
}

// Alias: name requested by the spec — same function, two exports.
export const pivotNumberedFieldsToPeople = extractPeopleFromNumberedFields;

// A person counts as empty when ALL identity fields are blank. Such entries
// (blank form blocks) must never produce a row in the Excel.
// Valor "em branco de fato": null/vazio OU token null-like que a IA às vezes
// escreve literalmente ("null", "N/A", "-", "…"). Sem isto, um registro que a
// IA devolve com nome "null" viraria uma LINHA FANTASMA (visto em run real,
// pág 62: 3 pacientes + 6 registros com nome nulo).
const _NULLISH_RE = /^(null|undefined|n\/?a|nao informado|não informado|ilegivel|ilegível|-+|\.+)$/i;
export function isBlankish(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === "" || _NULLISH_RE.test(s);
}
export function isEmptyPerson(p) {
  if (!p) return true;
  return [p.nome_completo, p.telefone, p.cidade, p.data_nascimento, p.email_ou_instagram, p.funcao_cargo]
    .every(isBlankish);
}

// Identity key for de-duplication. Same (page, name, phone, contact) = same person,
// regardless of whether it arrived as people[] or was pivoted from numbered fields[].
function personIdentityKey(p) {
  const name = (p.nome_completo || "").trim().toLowerCase();
  const phone = (p.telefone || "").replace(/\D/g, "");
  const contact = (p.email_ou_instagram || "").trim().toLowerCase();
  return `p${p.page ?? 1}|${name}|${phone}|${contact}`;
}

// Resolve people from a consolidated document.
//
// BUG FIX (multi-page loss): previously this was all-or-nothing — if ANY page
// returned people[], every page that returned NUMBERED fields[] instead was
// silently dropped. With handwritten forms the vision model mixes both shapes
// across near-identical pages, so pages came through only as "3, 5, 6, 7, 15".
//
// Now we MERGE both sources (explicit people[] + people pivoted from numbered
// fields[]), dedupe by identity, and drop empty rows. No page is lost just
// because another page used a different output shape.
function resolvePeople(consolidated) {
  const explicit = (Array.isArray(consolidated.people) ? consolidated.people : [])
    .map(p => ({ ...p }))
    .filter(p => !isEmptyPerson(p));

  // Pages already represented by explicit people[] — their numbered fields[] are
  // the SAME data in a worse shape, so we must NOT pivot them (would duplicate).
  // Pages that have NO explicit people[] are recovered from their numbered fields.
  const pagesWithPeople = new Set(explicit.map(p => p.page ?? 1));
  const pivotedAll = extractPeopleFromNumberedFields(consolidated.fields || []);
  const pivoted = pivotedAll.filter(p => !isEmptyPerson(p) && !pagesWithPeople.has(p.page ?? 1));

  // Merge + dedupe by identity (safety net against any residual overlap).
  const seen = new Set();
  const merged = [];
  for (const p of [...explicit, ...pivoted]) {
    const key = personIdentityKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
  }

  const source =
    explicit.length && pivoted.length ? "people[] + fields[] numerados (por página)"
    : explicit.length ? "people[] (IA direto)"
    : pivoted.length ? "fields[] numerados (derivado)"
    : "nenhuma pessoa detectada";

  return { people: merged, source };
}

// ─── Generate XLSX from validated document ──────────────────────────────────
// Input: consolidated document (output of consolidationService)
// Output: { buffer, filename, mimetype }
// ─── Client-mode table helpers ───────────────────────────────────────────────
// Decide the sheet name for a tabular document based on its headers.
// Material/order tables → "Itens"; anything else tabular → "Tabela".
const ITEMS_HEADER_HINTS = [
  "item", "material", "texto breve", "qtd", "quantidade", "unidade",
  "preço", "preco", "valor", "data de remessa", "ncm", "cfop", "produto",
];
function pickTableSheetName(tables) {
  const flat = (h) => {
    if (h == null) return "";
    if (typeof h === "object") return String(h.value ?? h.text ?? h.raw ?? "");
    return String(h);
  };
  const headerText = tables
    .flatMap(t => (Array.isArray(t.headers) ? t.headers : []))
    .map(flat)
    .join(" ")
    .toLowerCase();
  const hits = ITEMS_HEADER_HINTS.filter(h => headerText.includes(h)).length;
  return hits >= 2 ? "Itens" : "Tabela";
}

// Consolidate one or more tables into a single sheet (header row once),
// adding a trailing "Página" column when there are page numbers and the
// header doesn't already include one. Tables with identical headers are
// stacked; differing tables still go in but keep their own rows under the
// first header (best-effort — the common real case is identical headers
// across pages of the same document).
function buildConsolidatedTableSheet(tables) {
  const real = tables.filter(t => Array.isArray(t.headers) && t.headers.length > 0
    && Array.isArray(t.rows) && t.rows.length > 0);
  if (real.length === 0) return null;

  // Headers may also arrive as { value } objects — flatten to plain strings.
  const headerToText = (h) => {
    if (h == null) return "";
    if (typeof h === "object") return String(h.value ?? h.text ?? h.raw ?? "");
    return String(h);
  };
  // Use the headers of the first table as the canonical header.
  const baseHeaders = real[0].headers.map(headerToText);
  const alreadyHasPagina = baseHeaders.some(h => h.trim().toLowerCase() === "página"
    || h.trim().toLowerCase() === "pagina");

  // Classify each column by its header so we can normalize ONLY what is safe.
  // We only ever touch date columns here (separator → "/", no birth-year guess).
  // Codes, money, quantities and text are preserved exactly as extracted.
  const colKinds = baseHeaders.map(h => classifyField(h));

  // Cells may arrive as primitives OR objects like { value, confidence }.
  // Always extract the real value before writing — never serialize an object
  // (that would render as "[object Object]" in the spreadsheet).
  const cellToValue = (cell) => {
    if (cell == null) return "";
    if (typeof cell === "object") return cell.value ?? cell.text ?? cell.raw ?? "";
    return cell;
  };

  const normalizeCell = (cell, kind) => {
    const value = cellToValue(cell);
    if (value === "" || value == null) return "";
    const s = String(value);
    if (kind === "date" || kind === "birthdate") {
      // Only normalize a clean date pattern; otherwise leave untouched.
      // Tables never use birth-year guessing (assumeBirthYear:false).
      const out = normalizeDate(s, { assumeBirthYear: false });
      return out.value != null ? out.value : s;
    }
    // money / quantity / code / text / phone-in-table → preserve verbatim
    return s;
  };

  // Should we add a Página column? Only if at least one table has a page
  // and the header doesn't already include it.
  const anyPage = real.some(t => t.page != null);
  const addPagina = anyPage && !alreadyHasPagina;

  const headerRow = addPagina ? [...baseHeaders, "Página"] : baseHeaders;
  const out = [headerRow];

  real.forEach(tbl => {
    tbl.rows.forEach(row => {
      const src = Array.isArray(row) ? row : [row];
      // Extract + normalize EVERY cell (never leave a raw object behind).
      const r = src.map((cell, i) => normalizeCell(cell, colKinds[i] || "text"));
      // Pad/trim row to base header length before appending Página
      if (addPagina) {
        while (r.length < baseHeaders.length) r.push("");
        r.push(tbl.page != null ? tbl.page : "");
      }
      out.push(r);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(out);
  // Reasonable column widths
  ws["!cols"] = headerRow.map((h) => ({ wch: Math.min(40, Math.max(10, String(h).length + 4)) }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: out.length - 1, c: headerRow.length - 1 } }) };
  return { ws, sheetName: pickTableSheetName(real), rowCount: out.length - 1 };
}

// ─── Partial-processing helpers ─────────────────────────────────────────────
// Compress a list of page numbers into a human range string, e.g.
// [3,4,5,6,15] → "3-6, 15". Used in the partial-status sheet/filename.
function formatPageList(pages) {
  const nums = [...new Set((pages || []).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
  if (nums.length === 0) return "—";
  const ranges = [];
  let start = nums[0], prev = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === prev + 1) { prev = nums[i]; continue; }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = nums[i];
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}

// Normalize the optional processing metadata sent by the frontend.
function readProcessing(consolidated) {
  const p = consolidated && consolidated.processing;
  if (!p || typeof p !== "object") return null;
  const total = p.totalPages || 0;
  const success = Array.isArray(p.successfulPages) ? p.successfulPages : [];
  const failed = Array.isArray(p.failedPages) ? p.failedPages : [];
  const skipped = Array.isArray(p.skippedPages) ? p.skippedPages : [];
  const isPartial = p.isPartial === true || p.status === "partial_failed" || p.status === "failed"
    || (total > 0 && success.length < total);
  return { isPartial, total, success, failed, skipped, status: p.status || (isPartial ? "partial_failed" : "complete"), stopReason: p.stopReason || null };
}

// Build the "⚠ PARCIAL" warning sheet so the file is self-describing even if
// opened later outside the app. Does NOT touch the Pessoas sheet.
function buildPartialNoticeSheet(proc) {
  const stop = proc.stopReason;
  const motivo = stop
    ? (stop.code === "quota"
        ? `Limite/cota da IA atingido na página ${stop.page}`
        : `Processamento interrompido na página ${stop.page}`)
    : "Algumas páginas não foram processadas";
  const aoa = [
    ["⚠ PROCESSAMENTO PARCIAL — este arquivo NÃO contém o documento completo"],
    [],
    ["Status", "Processamento parcial"],
    ["Páginas processadas com sucesso", `${proc.success.length} de ${proc.total}`],
    ["Páginas com sucesso", formatPageList(proc.success)],
    ["Páginas com falha", formatPageList(proc.failed)],
    ["Páginas não processadas", formatPageList(proc.skipped)],
    ["Motivo", motivo],
    [],
    ["Os dados abaixo (aba Pessoas) referem-se SOMENTE às páginas processadas com sucesso."],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 38 }, { wch: 44 }];
  return ws;
}

// Insert a sheet as the FIRST tab (so it is the one shown on open).
function prependSheet(wb, ws, name) {
  const finalName = sanitizeSheetName(name);
  XLSX.utils.book_append_sheet(wb, ws, finalName);
  wb.SheetNames = [finalName, ...wb.SheetNames.filter(n => n !== finalName)];
}

export function generateExcel(consolidated, options = {}) {
  // clientMode=true → ONLY the "Pessoas" sheet (clean, client-facing output).
  // clientMode=false → full technical workbook (Dados, Para Revisar, Tabelas,
  //   Avisos, Auditoria) for internal/debug use. The internal review/audit
  //   logic is preserved; it just isn't written to the client's file.
  const { clientMode = false } = options;
  const wb = XLSX.utils.book_new();

  const {
    fields = [],
    tables = [],
    warnings = [],
    rows = [],
    headers = [],
    document_name,
    overall_confidence = 0,
    fields_with_value = 0,
    request_id,
    total_pages,
    pipeline,
    providers_used = [],
    cost_estimate_usd = 0,
    generated_at,
  } = consolidated;

  // Resolve people: prefer people[], else reconstruct from numbered fields[]
  const { people, source: peopleSource } = resolvePeople(consolidated);

  // Dev-only diagnostic: how many pages/people arrived vs. how many were written.
  if (process.env.NODE_ENV !== "production") {
    const incomingPeople = Array.isArray(consolidated.people) ? consolidated.people.length : 0;
    const fieldPages = new Set((consolidated.fields || []).map(f => f.page ?? 1)).size;
    const peoplePages = new Set([
      ...(consolidated.people || []).map(p => p.page ?? 1),
    ]).size;
    console.log("[ExcelService]", {
      receivedPages: Math.max(fieldPages, peoplePages, total_pages || 0),
      receivedPeople: incomingPeople,
      receivedFields: (consolidated.fields || []).length,
      resolvedPeople: people.length,
      resolvedPages: new Set(people.map(p => p.page ?? 1)).size,
      writtenRows: people.filter(p => !isEmptyPerson(p)).length,
    });
  }

  const peopleNeedingReview = people.filter(p => p.needs_review || (p.confidence ?? 0) < CONFIDENCE_HIGH).length;
  const peopleAvgConfidence = people.length
    ? people.reduce((s, p) => s + (p.confidence ?? 0), 0) / people.length
    : 0;

  // Audit info (always included)
  const auditInfo = {
    "Documento": document_name || "documento",
    "Data extração": new Date(generated_at || Date.now()).toLocaleString("pt-BR"),
    "Pipeline": pipeline || "—",
    "Provedores IA": providers_used.join(" + ") || "—",
    "Páginas processadas": total_pages ?? "—",
    "Confiança geral": `${(overall_confidence * 100).toFixed(1)}%`,
    "Campos extraídos": fields.length,
    "Campos preenchidos": fields_with_value,
    "Pessoas extraídas": people.length,
    "Pessoas p/ revisar": peopleNeedingReview,
    "Confiança média pessoas": people.length ? `${(peopleAvgConfidence * 100).toFixed(1)}%` : "—",
    "Origem das pessoas": peopleSource,
    "Avisos": warnings.length,
    "Custo estimado (USD)": `$${cost_estimate_usd.toFixed(6)}`,
    "Request ID": request_id || "—",
    "Gerado por": "DocXtract Backend v1.3",
  };

  // ─── Detect pivot pattern: "Entity X - Attribute" ──────────────────────
  const pivotRegex = /^(.+?)\s*[-–—:]\s*(.+)$/;
  const grouped = {};
  const entityOrder = [];
  const attrOrder = [];
  let pivotCount = 0;

  fields.forEach(f => {
    const m = (f.name || "").match(pivotRegex);
    if (m) {
      const entity = m[1].trim();
      const attr = m[2].trim();
      if (!grouped[entity]) { grouped[entity] = {}; entityOrder.push(entity); }
      if (!attrOrder.includes(attr)) attrOrder.push(attr);
      const cur = grouped[entity][attr];
      const score = (x) => (x.value && x.value.trim() ? 100 : 0) + (x.confidence || 0);
      if (!cur || score(f) > score(cur)) grouped[entity][attr] = f;
      pivotCount++;
    }
  });

  const usePivot = pivotCount >= fields.length * 0.6 && entityOrder.length >= 2;

  // ─── Sheet 1: Pessoas (PRIMEIRA — aba mais importante p/ fichas) ───────
  // 6 colunas conforme spec do cliente. Confidence/Needs review/Warnings
  // continuam disponíveis nas abas Para Revisar / Avisos / Auditoria.
  if (people.length > 0) {
    // Função/Cargo: only for candidate-registration forms that have the
    // "Caso ocupe alguma função" section. Other docs never get this column.
    const showRole = hasRoleSection(fields) || people.some(p => p.funcao_cargo && String(p.funcao_cargo).trim());
    // Colunas EXTRAS dinâmicas: união (na ordem de aparição) dos campos extras
    // das pessoas (Pai, Mãe, Endereço, CPF, SUS, …). Documentos sem extras
    // continuam com exatamente o layout de 5 colunas + Página de antes.
    // Colunas clássicas ADAPTATIVAS (pedido do usuário, 20/07/2026): o layout
    // não é mais engessado no padrão da ficha de cadastro. Telefone/Cidade/
    // Data de nascimento/E-mail só são escritas se ALGUMA pessoa do documento
    // tiver valor (mesma regra que Função/Cargo já usava). Certidões e
    // relatórios (CPF, Pai, Mãe, …) ficam só com as colunas que existem;
    // "Nome completo" é a âncora de identidade e permanece sempre.
    const writtenPeople = people.filter(p => !isEmptyPerson(p));
    const hasVal = (v) => v != null && String(v).trim() !== "";
    const classicCols = [
      ["Telefone",           (p) => p.telefone,           18],
      ["Cidade",             (p) => p.cidade,             20],
      ["Data de nascimento", (p) => p.data_nascimento,    18],
      ["E-mail/Instagram",   (p) => p.email_ou_instagram, 30],
    ].filter(([, get]) => writtenPeople.some(p => hasVal(get(p))));
    // Extras dinâmicos (Pai, Mãe, CPF, SUS, …) com MERGE case-insensitive:
    // "Mãe"/"mãe" viram UMA coluna só (a IA varia o casing entre páginas).
    const extra = mergeExtraColumns(writtenPeople);
    const peopleHeaders = [
      "Nome completo",
      ...classicCols.map(([h]) => h),
      ...(showRole ? ["Função/Cargo"] : []),
      ...extra.labels,
      "Página",
    ];
    const peopleData = writtenPeople.map(p => [
      p.nome_completo ?? "",
      ...classicCols.map(([, get]) => get(p) ?? ""),
      ...(showRole ? [p.funcao_cargo ?? ""] : []),
      ...extra.keys.map(lk => extra.valueOf(p, lk)),
      p.page ?? 1,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([peopleHeaders, ...peopleData]);
    ws["!cols"] = [
      { wch: 32 },  // Nome completo (sempre presente)
      ...classicCols.map(([, , w]) => ({ wch: w })),
      ...(showRole ? [{ wch: 22 }] : []),  // Função/Cargo
      ...extra.labels.map(k => ({ wch: Math.min(32, Math.max(14, k.length + 4)) })),
      { wch: 8 },   // Página
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    // encode_range em vez de fromCharCode: suporta >26 colunas (AA, AB, …)
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: peopleData.length, c: peopleHeaders.length - 1 } }),
    };
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Pessoas"));
  }

  // ─── CLIENT MODE: single clean sheet, dynamic by content ─────────────────
  //   a) people  → "Pessoas"
  //   b) tables  → "Itens"/"Tabela" (consolidated)
  //   c) fields  → "Dados"
  //   d) nothing → empty "Pessoas" (extreme fallback only)
  if (clientMode) {
    const proc = readProcessing(consolidated);
    const finishClient = () => {
      // Partial run → self-describing notice sheet (shown first) + "_parcial" name.
      let baseName = sanitizeFilename(document_name || "docxtract");
      if (proc && proc.isPartial) {
        prependSheet(wb, buildPartialNoticeSheet(proc), "⚠ PARCIAL");
        baseName = `${baseName}_parcial_${proc.success.length}_de_${proc.total}_paginas`;
      }
      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      return {
        buffer,
        filename: `${baseName}.xlsx`,
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes: buffer.length,
        is_partial: !!(proc && proc.isPartial),
      };
    };

    // (a) People already appended above when people.length > 0.
    if (people.length > 0) {
      // FIX (perda Preview→Excel): campos do documento que NÃO pertencem a
      // nenhuma pessoa (cabeçalho de cartório, testemunhas com índice no meio
      // do nome, observações, selos…) eram descartados neste return — a
      // Preview os mostrava e o Excel não. Agora saem na aba "Dados";
      // a aba Pessoas continua a primeira e exatamente igual.
      const absorbedByPeople = (f) => {
        const name = String(f.name || "").trim();
        if (PEOPLE_FIELD_PATTERNS.some(p => p.re.test(name))) return true;
        if (roleFromField(f) !== null) return true;
        const mTail = name.match(/[\s_\-]*\(?(\d+)\)?\s*$/);
        const base = mTail && mTail.index > 0 ? name.slice(0, mTail.index).trim() : "";
        // Espelha o pivot: selo/carimbo numerado NÃO é absorvido por pessoa.
        return !!(base && !/\b(selo|carimbo)\b/i.test(base));
      };
      const leftover = (consolidated.fields || []).filter(
        f => f && f.name && f.value != null && String(f.value).trim() !== "" && !absorbedByPeople(f)
      );
      if (leftover.length > 0) {
        const dataRows = leftover.map(f => [f.name, String(f.value), f.page ?? 1]);
        const wsData = XLSX.utils.aoa_to_sheet([["Campo", "Valor", "Página"], ...dataRows]);
        wsData["!cols"] = [{ wch: 28 }, { wch: 45 }, { wch: 8 }];
        wsData["!freeze"] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(wb, wsData, sanitizeSheetName("Dados"));
      }
      // Mesma classe de perda: TABELAS retornadas pela IA (ex.: histórico de
      // "Alterações" das fichas) eram descartadas quando havia pessoas — a
      // Preview as mostrava e o Excel não. Visto em run real (18/07/2026).
      const tableSheetWithPeople = buildConsolidatedTableSheet(tables);
      if (tableSheetWithPeople) {
        XLSX.utils.book_append_sheet(
          wb, tableSheetWithPeople.ws, sanitizeSheetName(tableSheetWithPeople.sheetName)
        );
      }
      return finishClient();
    }

    // (b) No people → if there are real tables, emit a single Itens/Tabela sheet.
    const tableSheet = buildConsolidatedTableSheet(tables);
    if (tableSheet) {
      XLSX.utils.book_append_sheet(wb, tableSheet.ws, sanitizeSheetName(tableSheet.sheetName));
      return finishClient();
    }

    // (c) No people, no tables → simple "Dados" sheet from extracted fields.
    const valuedFields = (consolidated.fields || []).filter(
      f => f && f.name && f.value != null && String(f.value).trim() !== ""
    );
    if (valuedFields.length > 0) {
      const dataRows = valuedFields.map(f => [f.name, String(f.value), f.page ?? 1]);
      const wsData = XLSX.utils.aoa_to_sheet([["Campo", "Valor", "Página"], ...dataRows]);
      wsData["!cols"] = [{ wch: 28 }, { wch: 45 }, { wch: 8 }];
      wsData["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, wsData, sanitizeSheetName("Dados"));
      return finishClient();
    }

    // (d) Truly empty document → single empty Pessoas sheet so file is valid.
    const empty = XLSX.utils.aoa_to_sheet([
      ["Nome completo", "Telefone", "Cidade", "Data de nascimento", "E-mail/Instagram", "Página"],
    ]);
    empty["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, empty, sanitizeSheetName("Pessoas"));
    return finishClient();
  }

  // ─── Sheet 2: Dados ────────────────────────────────────────────────────
  if (usePivot) {
    const usefulAttrs = attrOrder.filter(a =>
      entityOrder.some(e => grouped[e][a] && grouped[e][a].value && grouped[e][a].value.trim())
    );
    const sheetHeaders = ["Registro", ...usefulAttrs];
    const data = entityOrder.map(e => [
      e,
      ...usefulAttrs.map(a => {
        const f = grouped[e][a];
        return f && f.value ? f.value : "";
      })
    ]);
    const ws = XLSX.utils.aoa_to_sheet([sheetHeaders, ...data]);
    ws["!cols"] = sheetHeaders.map((h, i) => ({
      wch: Math.min(Math.max(h.length, ...data.map(r => String(r[i] ?? "").length)) + 3, 45)
    }));
    ws["!freeze"] = { xSplit: 1, ySplit: 1 };
    if (data.length > 0) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: sheetHeaders.length - 1 } })
      };
    }
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Dados"));
  } else {
    const nonEmpty = fields.filter(f => f.value && String(f.value).trim());
    if (nonEmpty.length > 0) {
      const data = nonEmpty.map(f => [f.name, f.value, f.page || 1]);
      const ws = XLSX.utils.aoa_to_sheet([["Campo", "Valor", "Página"], ...data]);
      ws["!cols"] = [
        { wch: Math.min(Math.max(...data.map(r => String(r[0]).length)) + 2, 35) },
        { wch: Math.min(Math.max(...data.map(r => String(r[1]).length)) + 2, 45) },
        { wch: 8 },
      ];
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!autofilter"] = { ref: `A1:C${data.length + 1}` };
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Dados"));
    } else {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ["(nenhum dado extraído)", ""]]),
        sanitizeSheetName("Dados")
      );
    }
  }

  // ─── Sheet 3: Para Revisar ─────────────────────────────────────────────
  const toReview = fields.filter(f =>
    f.needs_review ||
    (f.confidence || 1) < CONFIDENCE_HIGH ||
    (f.warnings && f.warnings.length > 0) ||
    f.validation_status === "illegible" ||
    f.validation_status === "uncertain"
  );

  // People that need review go to "Para Revisar" too (task 8)
  const peopleToReview = people.filter(p =>
    p.needs_review || (p.confidence ?? 1) < CONFIDENCE_HIGH ||
    (Array.isArray(p.warnings) && p.warnings.length > 0)
  );

  if (toReview.length > 0 || peopleToReview.length > 0) {
    const fieldRows = toReview.map(f => {
      const statusIcon = f.validation_status === "illegible" ? "❌ Ilegível"
        : f.validation_status === "empty" || f.validation_status === "empty_not_marked" ? "⬜ Vazio"
        : f.validation_status === "uncertain" ? "⚠️ Incerto"
        : (f.confidence || 1) < CONFIDENCE_MED ? "🔴 Conf. baixa"
        : (f.confidence || 1) < CONFIDENCE_HIGH ? "🟡 Conf. média"
        : "🔍 Revisar";
      return [
        f.name,
        f.value || "(vazio)",
        f.page || 1,
        `${((f.confidence || 0) * 100).toFixed(0)}%`,
        statusIcon,
        f.reviewed_by || "gemini",
        (f.warnings || []).join(" · "),
      ];
    });
    // Append people rows (prefixed so it's clear they are people)
    const peopleRows = peopleToReview.map(p => [
      `👤 ${p.nome_completo || "(pessoa sem nome)"}`,
      [p.telefone, p.cidade, p.data_nascimento, p.email_ou_instagram].filter(Boolean).join(" | ") || "(sem dados)",
      p.page || 1,
      `${((p.confidence ?? 0) * 100).toFixed(0)}%`,
      (p.confidence ?? 1) < CONFIDENCE_MED ? "🔴 Conf. baixa"
        : (p.confidence ?? 1) < CONFIDENCE_HIGH ? "🟡 Conf. média" : "🔍 Revisar",
      "pessoa",
      Array.isArray(p.warnings) ? p.warnings.join(" · ") : "",
    ]);

    const allReviewData = [...fieldRows, ...peopleRows];
    const headersRow = ["Campo", "Valor", "Pág", "Confiança", "Status", "Revisor", "Observação"];
    const ws = XLSX.utils.aoa_to_sheet([headersRow, ...allReviewData]);
    ws["!cols"] = [{ wch: 32 }, { wch: 32 }, { wch: 6 }, { wch: 11 }, { wch: 17 }, { wch: 10 }, { wch: 50 }];
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = { ref: `A1:G${allReviewData.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Para Revisar"));
  }

  // ─── Sheet 3: Tabelas ──────────────────────────────────────────────────
  const realTables = tables.filter(t => t.headers?.length > 0 && t.rows?.length > 0);
  if (realTables.length > 0) {
    const allData = [];
    realTables.forEach((tbl, ti) => {
      allData.push([`Tabela ${ti + 1}${tbl.title ? ` — ${tbl.title}` : ""} (Pág ${tbl.page})`]);
      allData.push(tbl.headers);
      tbl.rows.forEach(row =>
        allData.push(row.map(cell => typeof cell === "object" ? (cell.value ?? "") : String(cell ?? "")))
      );
      allData.push([]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allData), sanitizeSheetName("Tabelas"));
  }

  // ─── Sheet 4: Avisos ───────────────────────────────────────────────────
  // Detailed structure: Severidade | Pessoa | Campo | Valor original | Problema | Página
  // People warnings come from ._warning_details (set by extractPeopleFromNumberedFields)
  // OR from p.warnings if they came from validation layer (Etapa 2).
  const detailedRows = [];

  // Page/field-level document warnings — fill what we can
  warnings.forEach(w => {
    detailedRows.push([
      w.severity || "warning",
      "",                          // Pessoa (not applicable for doc warnings)
      "",                          // Campo
      "",                          // Valor original
      w.msg || String(w),          // Problema
      (w.src && w.src.match(/Pág\s*(\d+)/i)?.[1]) || "",
    ]);
  });

  // Person-level warnings: use _warning_details when present, else parse strings
  people.forEach((p, idx) => {
    const label = p.nome_completo || `Pessoa #${idx + 1}`;
    const details = Array.isArray(p._warning_details) ? p._warning_details : null;

    if (details && details.length > 0) {
      details.forEach(d => {
        detailedRows.push([
          "warning",
          label,
          d.field || "",
          d.original || "",
          d.problem || "",
          p.page ?? 1,
        ]);
      });
    } else if (Array.isArray(p.warnings) && p.warnings.length > 0) {
      // Fallback for people from validation layer — split "field: problem" if present
      p.warnings.forEach(w => {
        const s = typeof w === "string" ? w : (w.msg || String(w));
        const m = s.match(/^([a-z_]+):\s*(.+)$/i);
        detailedRows.push([
          "warning",
          label,
          m ? m[1] : "",
          "",
          m ? m[2] : s,
          p.page ?? 1,
        ]);
      });
    }
  });

  if (detailedRows.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Severidade", "Pessoa", "Campo", "Valor original", "Problema", "Página"],
      ...detailedRows,
    ]);
    ws["!cols"] = [
      { wch: 11 }, { wch: 30 }, { wch: 22 }, { wch: 25 }, { wch: 50 }, { wch: 7 }
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = { ref: `A1:F${detailedRows.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Avisos"));
  }

  // ─── Sheet final: Auditoria (always included) ──────────────────────────
  const auditRows = Object.entries(auditInfo).map(([k, v]) => [k, v]);
  const wsAudit = XLSX.utils.aoa_to_sheet([["Propriedade", "Valor"], ...auditRows]);
  wsAudit["!cols"] = [{ wch: 24 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsAudit, sanitizeSheetName("Auditoria"));

  // ─── Generate binary ───────────────────────────────────────────────────
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  const filename = `${sanitizeFilename(document_name || "docxtract")}.xlsx`;

  return {
    buffer,
    filename,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: buffer.length,
  };
}

// ─── Replace rows (for user edits applied before download) ──────────────────
// If user edited fields in the review panel, the rows array contains the edited values.
// We need to project those back into the fields array so generateExcel uses them.
export function applyRowEdits(consolidated, editedRows) {
  if (!editedRows || !Array.isArray(editedRows)) return consolidated;

  const fields = consolidated.fields.map(f => {
    const row = editedRows.find(r => r._page === f.page);
    if (row && row[f.name] !== undefined && row[f.name] !== f.value) {
      return { ...f, value: row[f.name], reviewed_by: "user_edit" };
    }
    return f;
  });

  return { ...consolidated, fields, rows: editedRows };
}
