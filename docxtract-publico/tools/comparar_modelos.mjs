// ════════════════════════════════════════════════════════════════════════════
//  DocXtract — COMPARADOR DE MODELOS (flash vs flash-lite)
//  Roda as MESMAS páginas do PDF em cada modelo e compara:
//    • quantos pacientes/mães cada um extrai
//    • se o modelo barato CONCORDA com o flash (referência) campo a campo
//    • tokens e custo estimado de cada modelo
//  A concordância entre modelos não substitui a revisão manual.
//
//  COMO RODAR:
//    # Na raiz do projeto, defina DOCX_PDF antes de executar.
//    node tools/comparar_modelos.mjs 1-30
//  (o "1-30" é o intervalo de páginas do piloto; pode trocar)
//
//  Requisitos: GEMINI_API_KEY própria no backend/.env e cota para os modelos.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PDF_INPUT = process.env.DOCX_PDF?.trim();
if (!PDF_INPUT) {
  console.error("Defina DOCX_PDF com o caminho do PDF antes de executar. Consulte tools/README-lote.md.");
  process.exit(1);
}
const PDF = resolve(PDF_INPUT);

// ── Modelos a comparar (1º = referência de comparação) ──
const MODELS = [
  { id: "gemini-2.5-flash",        inUSD: 0.30, outUSD: 2.50 },
  { id: "gemini-flash-lite-latest", inUSD: 0.10, outUSD: 0.40 },
];
const USD_BRL = Number(process.env.USD_BRL || 5.5);

// ── Intervalo de páginas (arg "1-30") ──
const arg = process.argv[2] || "1-10";
const [P1, P2] = arg.split("-").map(Number);

// ── Dependências reais do projeto ──
const pdfjs = await import(pathToFileURL(join(ROOT, "frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(ROOT, "frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
const { safeParseAIJson } = await import(pathToFileURL(join(ROOT, "backend/src/utils/json.js")).href);
const { pivotNumberedFieldsToPeople } = await import(pathToFileURL(join(ROOT, "backend/test/_frontendConsolidate.fixture.mjs")).href);

// ── Prompt real do frontend ──
const jsx = readFileSync(join(ROOT, "frontend/src/DocXtract.jsx"), "utf8");
const s = jsx.indexOf("const GEMINI_PROMPT = (p, t) =>");
const e = jsx.indexOf("`;", s) + 1;
const GEMINI_PROMPT = eval(`(${jsx.slice(s, e).replace("const GEMINI_PROMPT = ", "")})`);

// ── Chave (só usada localmente; nunca impressa) ──
const env = readFileSync(join(ROOT, "backend/.env"), "utf8");
const KEY = (env.match(/GEMINI_API_KEY\s*=\s*(\S+)/) || [])[1];
if (!KEY) { console.error("✗ GEMINI_API_KEY não encontrada em backend/.env"); process.exit(1); }

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true, isEvalSupported: false }).promise;
console.log(`PDF: ${doc.numPages} páginas · piloto: ${P1}–${P2} (${P2 - P1 + 1} páginas) · câmbio R$${USD_BRL}\n`);

async function pageText(n) {
  const page = await doc.getPage(n);
  const rows = new Map();
  for (const it of (await page.getTextContent()).items) {
    if (it.str === undefined) continue;
    const y = Math.round(it.transform[5]);
    (rows.get(y) || rows.set(y, []).get(y)).push({ x: it.transform[4], s: it.str });
  }
  let out = "";
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    const line = rows.get(y).sort((a, b) => a.x - b.x);
    let px = null, ss = "";
    for (const g of line) { if (px !== null && g.x - px > 40) ss += "    "; else if (px !== null && g.x - px > 8) ss += " "; ss += g.s; px = g.x + g.s.length * 5; }
    if (ss.trim()) out += ss + "\n";
  }
  return out;
}

async function callModel(model, prompt) {
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 32000 } }),
  });
  const d = await r.json();
  if (d.error) throw new Error("API: requisição rejeitada pelo provedor");
  const u = d.usageMetadata || {};
  return {
    text: d.candidates?.[0]?.content?.parts?.[0]?.text || "",
    inTok: u.promptTokenCount || 0,
    outTok: (u.totalTokenCount || 0) - (u.promptTokenCount || 0),   // inclui raciocínio
    ms: Date.now() - t0,
  };
}

// chave de identidade de uma pessoa (nome normalizado)
const nkey = (p) => String(p.nome_completo || "").trim().toUpperCase().replace(/\s+/g, " ");
const fieldVals = (p) => ({
  mae: String(p.extra_fields?.["Mãe"] ?? p.extra_fields?.["mãe"] ?? "").trim().toUpperCase(),
  cpf: String(p.extra_fields?.["CPF"] ?? p.extra_fields?.["cpf"] ?? "").replace(/\D/g, ""),
  sus: String(p.extra_fields?.["Número SUS"] ?? p.extra_fields?.["número SUS"] ?? "").replace(/\D/g, ""),
});

// ── Extrai o piloto com cada modelo ──
const results = {};
for (const m of MODELS) {
  console.log(`\n═══ Modelo: ${m.id} ═══`);
  const people = [];
  let inTok = 0, outTok = 0, ms = 0, falhas = 0;
  try {
    for (let n = P1; n <= P2; n++) {
      const prompt = GEMINI_PROMPT(n, P2 - P1 + 1) + `\n\nTEXTO DA PÁGINA:\n\n${(await pageText(n)).slice(0, 14000)}`;
      try {
        const res = await callModel(m.id, prompt);
        inTok += res.inTok; outTok += res.outTok; ms += res.ms;
        const parsed = safeParseAIJson(res.text);
        const pv = parsed.ok ? pivotNumberedFieldsToPeople((parsed.data.fields || []).map(f => ({ ...f, page: n }))) : [];
        pv.forEach(p => people.push(p));
        process.stdout.write(`  pág ${n}: ${pv.length} pessoa(s)\r`);
      } catch (err) { falhas++; console.log(`  pág ${n}: FALHOU (consulte a configuração do provedor)`); }
    }
  } catch (err) { console.log(`  modelo indisponível: confira configuração e cota do provedor`); }
  const custoUSD = (inTok * m.inUSD + outTok * m.outUSD) / 1e6;
  results[m.id] = { people, custoUSD };
  console.log(`\n  → ${people.length} pessoas · ${people.filter(p => fieldVals(p).mae).length} com mãe · ${(inTok + outTok).toLocaleString()} tokens · ${(ms / 1000).toFixed(1)} s em chamadas concluídas · ${falhas} falha(s) · estimativa $${custoUSD.toFixed(4)} (R$${(custoUSD * USD_BRL).toFixed(2)})`);
}

// ── Comparação: modelos baratos vs referência (1º modelo) ──
const ref = MODELS[0].id;
const refPeople = new Map((results[ref]?.people || []).map(p => [nkey(p), fieldVals(p)]));
console.log(`\n\n════════ COMPARAÇÃO (referência: ${ref}) ════════`);
for (const m of MODELS.slice(1)) {
  const r = results[m.id];
  if (!r || !r.people.length) { console.log(`\n${m.id}: sem dados (indisponível/cota).`); continue; }
  let mesmasPessoas = 0, maeIgual = 0, cpfIgual = 0, susIgual = 0, comparados = 0;
  for (const p of r.people) {
    const refv = refPeople.get(nkey(p));
    if (!refv) continue;
    mesmasPessoas++;
    const v = fieldVals(p);
    if (refv.mae) { comparados++; if (v.mae === refv.mae) maeIgual++; }
    if (refv.cpf && v.cpf === refv.cpf) cpfIgual++;
    if (refv.sus && v.sus === refv.sus) susIgual++;
  }
  const pct = (a, b) => b ? ((100 * a / b).toFixed(0) + "%") : "—";
  console.log(`\n${m.id}:`);
  console.log(`  Pessoas em comum com o flash : ${mesmasPessoas} de ${refPeople.size}`);
  console.log(`  MÃE igual à do flash         : ${maeIgual}/${comparados} (${pct(maeIgual, comparados)})  ← o mais crítico`);
  console.log(`  CPF igual                    : ${pct(cpfIgual, mesmasPessoas)}`);
  console.log(`  SUS igual                    : ${pct(susIgual, mesmasPessoas)}`);
  const economia = 1 - (r.custoUSD / (results[ref].custoUSD || 1));
  console.log(`  Estimativa neste piloto      : $${r.custoUSD.toFixed(4)} vs $${results[ref].custoUSD.toFixed(4)} (flash) → ${(economia * 100).toFixed(0)}% de economia estimada`);
  const full = r.custoUSD / (P2 - P1 + 1) * doc.numPages;
  console.log(`  Projeção p/ ${doc.numPages} páginas    : ~$${full.toFixed(0)} (R$${(full * USD_BRL).toFixed(0)})`);
}
const refFull = (results[ref]?.custoUSD || 0) / (P2 - P1 + 1) * doc.numPages;
console.log(`\n${ref} (referência) projeção ${doc.numPages} pág.: ~$${refFull.toFixed(0)} (R$${(refFull * USD_BRL).toFixed(0)})`);
console.log(`\nRevise uma amostra contra o documento original antes de escolher o modelo.`);
console.log(`Concordância entre modelos não comprova a exatidão dos dados.`);
