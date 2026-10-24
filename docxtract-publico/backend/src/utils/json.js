// ─── Robust AI-JSON parsing ─────────────────────────────────────────────────
// LLMs sometimes return JSON wrapped in markdown, with trailing commas, curly
// quotes, comments, invisible characters, or an unclosed bracket. This util
// recovers valid JSON with SAFE repairs only — it never invents data. If it
// cannot recover safely, it returns a structured error (message + position +
// nearby snippet) so the caller can mark the page as failed.

// Strip markdown fences + prose, then extract the largest {…} or […] block.
function stripToJsonBlock(text) {
  let s = String(text);
  s = s.replace(/```[a-zA-Z0-9]*\s*/g, "").replace(/```/g, ""); // markdown fences
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u00A0/g, " "); // invisible/nbsp
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  if (firstObj === -1 && firstArr === -1) return s.trim();

  let start, closeCh;
  if (firstArr === -1 || (firstObj !== -1 && firstObj < firstArr)) { start = firstObj; closeCh = "}"; }
  else { start = firstArr; closeCh = "]"; }
  const end = s.lastIndexOf(closeCh);
  s = end > start ? s.slice(start, end + 1) : s.slice(start);
  return s.trim();
}

// Safe, string-aware repairs: normalize curly quotes, strip comments outside
// strings, drop trailing commas, close clearly-missing brackets, terminate a
// dangling string. Never adds keys/values.
function repairJson(input) {
  let s = String(input);
  // curly/smart double quotes → straight double; smart singles → straight single
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  // strip disallowed control chars (keep \n \r \t)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // Single string-aware pass that ALSO strips comments, inserts MISSING commas
  // between adjacent values/properties (the "Expected ',' or ']'" / "Expected
  // ',' or '}'" family), and tracks the open-bracket stack.
  const VALUE_START = /["{[\-0-9tfn]/;   // start of a value or a key
  let out = "";
  const stack = [];
  let inStr = false, esc = false;
  let pendingValueEnd = false;            // we just finished a value → a new value needs a comma

  for (let i = 0; i < s.length; i++) {
    const c = s[i], next = s[i + 1];

    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === '"') { out += c; inStr = false; pendingValueEnd = true; continue; }
      // raw control chars inside a string are invalid JSON → escape them
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      out += c;
      continue;
    }

    // comments (outside strings)
    if (c === "/" && next === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }

    // whitespace: copy, doesn't change state
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { out += c; continue; }

    // insert a missing comma when a new value/key starts right after a finished value
    if (pendingValueEnd && VALUE_START.test(c)) {
      out += ",";
      pendingValueEnd = false;
    }

    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ":" || c === ",") { out += c; pendingValueEnd = false; continue; }
    if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); out += c; pendingValueEnd = false; continue; }
    if (c === "}" || c === "]") { if (stack.length) stack.pop(); out += c; pendingValueEnd = true; continue; }

    // number / true / false / null token → consume whole token
    if (/[\-0-9tfn]/.test(c)) {
      let j = i;
      while (j < s.length && /[\w.+\-]/.test(s[j])) j++;
      out += s.slice(i, j);
      i = j - 1;
      pendingValueEnd = true;
      continue;
    }

    out += c;  // any stray char — leave as-is (will surface as structured error if fatal)
  }

  // terminate a dangling string (truncated response)
  if (inStr) out += '"';
  // remove trailing commas before a closer or end-of-input (in case repair created/left any)
  out = out.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*$/g, "");
  // close clearly-missing brackets (in reverse open order). SAFE: only closers.
  while (stack.length) out += stack.pop();
  return out;
}

// Compute 1-based line/column from a character offset.
function lineColFromPos(text, pos) {
  if (pos == null || pos < 0) return { line: null, column: null };
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, column: col };
}

// Main entry point.
// Returns { ok:true, data, repaired:boolean } or
//   { ok:false, error, raw_error, position, line, column, snippet, context, raw }.
export function safeParseAIJson(rawText, context = null) {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return { ok: false, error: "Resposta vazia da IA", raw_error: "empty", position: null, line: null, column: null, snippet: "", context, raw: rawText || "" };
  }

  const block = stripToJsonBlock(rawText);

  // 1) direct parse
  try {
    return { ok: true, data: JSON.parse(block), repaired: false };
  } catch { /* fall through to repairs */ }

  // 2) safe repairs (markdown/prose already stripped; now quotes, comments,
  //    trailing commas, MISSING commas, unclosed brackets, truncated strings)
  const repaired = repairJson(block);
  if (repaired !== block) {
    try {
      return { ok: true, data: JSON.parse(repaired), repaired: true };
    } catch { /* fall through to structured error */ }
  }

  // 3) structured error with position + line/column + nearby snippet
  let lastErr;
  try { JSON.parse(repaired); } catch (e) { lastErr = e; }
  const msg = lastErr && lastErr.message ? lastErr.message : "JSON inválido";
  const m = /position (\d+)/.exec(msg);
  const position = m ? parseInt(m[1], 10) : null;
  const { line, column } = lineColFromPos(repaired, position);
  let snippet;
  if (position != null) {
    const from = Math.max(0, position - 40), to = Math.min(repaired.length, position + 40);
    snippet = (from > 0 ? "…" : "") + repaired.slice(from, to) + (to < repaired.length ? "…" : "");
  } else {
    snippet = repaired.slice(0, 80);
  }
  return { ok: false, error: "JSON inválido retornado pela IA", raw_error: msg, position, line, column, snippet, context, raw: rawText };
}

// Prompt used for the "fix the JSON" second attempt (server-side reviewer).
export const FIX_JSON_PROMPT =
  "Corrija apenas a sintaxe do JSON abaixo. Não altere dados, não invente valores, não resuma e não remova registros. " +
  "Corrija vírgulas, colchetes, chaves e aspas se necessário. Retorne somente JSON válido, sem markdown.\n\nJSON:\n";

export { stripToJsonBlock, repairJson };
