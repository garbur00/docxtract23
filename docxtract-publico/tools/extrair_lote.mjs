// ════════════════════════════════════════════════════════════════════════════
//  DocXtract — EXTRAÇÃO EM LOTE (PDF digital → um Excel só)
//  Feito para PDFs GRANDES e DIGITAIS (texto nítido, ex.: relatórios do sistema).
//  • Retomável: se parar (cota/erro/luz), rodar de novo CONTINUA de onde parou.
//  • Auto-escalonamento: usa o modelo BARATO (flash-lite) e sobe para o CARO
//    (flash) só nas páginas arriscadas (registro raso / menos pessoas que o
//    texto mostra / fantasma).
//  • Ao receber erro de cota, salva o checkpoint e encerra o processamento.
//  • Log de erros por página; checkpoint periódico e ao terminar o lote.
//  • Formato COMPACTO: solicita um mapa de rótulos e valores em JSON.
//
//  COMO RODAR (do diretório do projeto):
//     node tools/extrair_lote.mjs               → todas as páginas (8 em paralelo)
//     node tools/extrair_lote.mjs 1-500         → só o intervalo 1-500
//     node tools/extrair_lote.mjs 1-500 --par=12    → 12 páginas ao mesmo tempo
//     node tools/extrair_lote.mjs --max=50          → teto estimado de R$50
//     node tools/extrair_lote.mjs 1-500 --so-barato → sem escalonar p/ flash
//
//  Entrada obrigatória: variável DOCX_PDF (caminho do PDF).
//  Saída em DOCX_OUTPUT_DIR (padrão: ./private-output):
//     DocXtract_lote.xlsx        → a planilha (atualizada a cada 100 págs)
//     DocXtract_lote.checkpoint.json → progresso (apague p/ recomeçar do zero)
//     DocXtract_lote.log.txt     → erros e eventos de interrupção
//
//  Requisitos: GEMINI_API_KEY própria no backend/.env e cota para os modelos.
//  Custos são estimativas locais; chamadas iniciadas podem ultrapassar --max.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PDF_INPUT = process.env.DOCX_PDF?.trim();
if (!PDF_INPUT) {
  console.error("Defina DOCX_PDF com o caminho do PDF antes de executar. Consulte tools/README-lote.md.");
  process.exit(1);
}
const PDF = resolve(PDF_INPUT);
const OUTPUT_DIR = resolve(process.env.DOCX_OUTPUT_DIR || "./private-output");
mkdirSync(OUTPUT_DIR, { recursive: true });
const OUT_XLSX = join(OUTPUT_DIR, "DocXtract_lote.xlsx");
const OUT_CKPT = join(OUTPUT_DIR, "DocXtract_lote.checkpoint.json");
const OUT_LOG = join(OUTPUT_DIR, "DocXtract_lote.log.txt");

const MODELO_BARATO = "gemini-flash-lite-latest";
const MODELO_CARO = "gemini-2.5-flash";
// Referências de preço em USD por milhão de tokens; confira antes de usar.
const PRECO = { [MODELO_BARATO]: { in: 0.30, out: 2.50 }, [MODELO_CARO]: { in: 0.30, out: 2.50 } };
const USD_BRL = 5.5;
const SALVA_A_CADA = 100;   // regenera o Excel a cada N páginas

const args = process.argv.slice(2);
const soBarato = args.includes("--so-barato");
const rangeArg = args.find(a => /^\d+-\d+$/.test(a));
const [P1, P2arg] = rangeArg ? rangeArg.split("-").map(Number) : [1, null];
// Teto estimado: interrompe novas páginas após atingir R$X. --max=50
const maxArg = args.find(a => /^--max=\d+(\.\d+)?$/.test(a));
const TETO_BRL = maxArg ? Number(maxArg.split("=")[1]) : Infinity;
// Páginas em paralelo. Ajuste --par=N de acordo com a cota da sua conta (máx 20).
const parArg = args.find(a => /^--par=\d+$/.test(a));
const CONCURRENCY = parArg ? Math.min(20, Math.max(1, Number(parArg.split("=")[1]))) : 8;

// Rejeita flags desconhecidas para evitar processamento com opções incorretas.
const FLAGS_VALIDAS = [/^\d+-\d+$/, /^--so-barato$/, /^--max=\d+(\.\d+)?$/, /^--par=\d+$/];
const invalidos = args.filter(a => !FLAGS_VALIDAS.some(re => re.test(a)));
if (invalidos.length) {
  console.error(`\n❌ Argumento não reconhecido: ${invalidos.join("  ")}`);
  console.error(`\nUso: node tools/extrair_lote.mjs [inicio-fim] [--so-barato] [--par=N] [--max=N]`);
  console.error(`  1-500         processa só as páginas 1 a 500 (sem isso: todas)`);
  console.error(`  --so-barato   nunca escala p/ o modelo caro (mais barato)`);
  console.error(`  --par=N       N páginas ao mesmo tempo (padrão 8, máx 20)`);
  console.error(`  --max=80      interrompe novas páginas após estimar R$80 (não é limite de cobrança)`);
  console.error(`\nNada foi processado — nenhuma página perdida. Corrija e rode de novo.\n`);
  process.exit(1);
}

// ── Dependências reais do projeto ──
const pdfjs = await import(pathToFileURL(join(ROOT, "frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(ROOT, "frontend/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
const { consolidateDocument } = await import(pathToFileURL(join(ROOT, "backend/src/services/consolidationService.js")).href);
const { generateExcel } = await import(pathToFileURL(join(ROOT, "backend/src/services/excelService.js")).href);
const fx = await import(pathToFileURL(join(ROOT, "backend/test/_frontendConsolidate.fixture.mjs")).href);
const XLSX = await import(pathToFileURL(join(ROOT, "backend/node_modules/xlsx/xlsx.mjs")).href);
const { safeParseAIJson } = await import(pathToFileURL(join(ROOT, "backend/src/utils/json.js")).href);
// Prompt compacto: solicita {"rótulo":"valor"} sem repetir objetos de campo.
const PROMPT_COMPACTO = (txt) => `DOCXTRACT — extração completa, formato COMPACTO.

Extraia TODOS os campos, textos, números e datas de CADA pessoa/registro na página — NÃO pule NADA (inclusive histórico "Alterado em…" e códigos internos).
VÁRIAS PESSOAS: numere cada campo pelo índice da pessoa — "Nome (1)","Mãe (1)"… "Nome (2)","Mãe (2)"… Use os RÓTULOS/cabeçalhos do próprio documento (ex.: coluna "Mãe") para associar cada valor ao registro da MESMA faixa horizontal (nunca ao de cima/baixo).
Elementos do documento que não são de pessoa (selos, carimbos, assinaturas) → nome SEM número.
Se o mesmo rótulo aparecer em seções diferentes do mesmo registro, diferencie (ex.: "Estado (1)" e "Estado Natur. (1)").

Responda APENAS um JSON MAPA compacto (rótulo→valor, sem objetos, sem confidence):
{"Nome (1)":"JOAO DA SILVA","Mãe (1)":"MARIA","CPF (1)":"123","Nome (2)":"ANA", ...}

TEXTO DA PÁGINA:
${txt}`;
// converte o mapa compacto para o formato fields[] que o pipeline usa
const mapToFields = (obj) => Array.isArray(obj?.fields)
  ? obj.fields
  : (obj && typeof obj === "object" && !Array.isArray(obj))
    ? Object.entries(obj).map(([name, value]) => ({ name, value: value == null ? "" : String(value), confidence: 0.9 }))
    : [];
const KEY = (readFileSync(join(ROOT, "backend/.env"), "utf8").match(/GEMINI_API_KEY\s*=\s*(\S+)/) || [])[1];
if (!KEY) { console.error("✗ GEMINI_API_KEY não encontrada em backend/.env"); process.exit(1); }

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true, isEvalSupported: false }).promise;
const P2 = P2arg || doc.numPages;
const log = (m) => { const line = `[${new Date().toLocaleTimeString()}] ${m}`; appendFileSync(OUT_LOG, line + "\n"); };

// ── Checkpoint (retomável) ──
let ckpt = { pages: {}, tokens: {}, escaladas: [], erros: [] };
if (existsSync(OUT_CKPT)) { try { ckpt = JSON.parse(readFileSync(OUT_CKPT, "utf8")); console.log(`↺ Retomando: ${Object.keys(ckpt.pages).length} páginas já feitas.`); } catch {} }
const saveCkpt = () => writeFileSync(OUT_CKPT, JSON.stringify(ckpt));

// ── Texto de uma página ──
async function pageLines(n) {
  const p = await doc.getPage(n); const rows = new Map();
  for (const it of (await p.getTextContent()).items) { if (it.str === undefined) continue; const y = Math.round(it.transform[5]); (rows.get(y) || rows.set(y, []).get(y)).push({ x: it.transform[4], s: it.str }); }
  const L = [];
  for (const y of [...rows.keys()].sort((a, b) => b - a)) { const line = rows.get(y).sort((a, b) => a.x - b.x); let px = null, ss = ""; for (const g of line) { if (px !== null && g.x - px > 40) ss += "    "; else if (px !== null && g.x - px > 8) ss += " "; ss += g.s; px = g.x + g.s.length * 5; } if (ss.trim()) L.push(ss); }
  return L;
}
// Quantos pacientes o TEXTO mostra (linha "NOME  DD-MM-AAAA MÃE") — sinal de risco
const patientLinesInText = (lines) => { const re = /^[A-ZÀ-Ú][A-ZÀ-Ú' ]{4,}?\s{2,}\d{2}-\d{2}-\d{4}\s*[A-ZÀ-Ú]/; return lines.filter(l => re.test(l)).length; };

// ── Chamada Gemini com backoff em cota ──
async function gemini(model, prompt) {
  for (let tent = 1; tent <= 4; tent++) {
    let d;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 32000 } }) });
      d = await r.json();
    } catch (err) { if (tent === 4) throw new Error("REDE: falha ao conectar ao provedor"); await sleep(1500 * tent); continue; }
    if (d.error) {
      if (/quota|RESOURCE_EXHAUSTED|exceeded|429/i.test(d.error.message)) { const e = new Error("QUOTA"); e.quota = true; throw e; }
      if (tent === 4) throw new Error("API: requisição rejeitada pelo provedor");
      await sleep(1500 * tent); continue;
    }
    const u = d.usageMetadata || {};
    return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || "", inTok: u.promptTokenCount || 0, outTok: (u.totalTokenCount || 0) - (u.promptTokenCount || 0) };
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const addTok = (model, inTok, outTok) => { const t = ckpt.tokens[model] || { in: 0, out: 0 }; t.in += inTok; t.out += outTok; ckpt.tokens[model] = t; };
const parsePeople = (fields, n) => fx.pivotNumberedFieldsToPeople((fields || []).map(f => ({ ...f, page: n }))).filter(p => !fx.clientIsEmptyPerson(p));
// Página com NOMES PARECIDOS (ex.: três registros com os mesmos nomes iniciais) é onde o modelo barato
// mais erra o pareamento mãe↔paciente → vale escalar p/ o flash (raciocina mais).
const _nomesParecidos = (ppl) => {
  const pref = ppl.map(p => String(p.nome_completo || "").toUpperCase().split(/\s+/).slice(0, 2).join(" ")).filter(Boolean);
  return pref.length !== new Set(pref).size;   // há 2+ com os mesmos 2 primeiros nomes
};

// ── Extrai uma página (com escalonamento) ──
async function extrairPagina(n) {
  const lines = await pageLines(n);
  const esperados = patientLinesInText(lines);
  const prompt = PROMPT_COMPACTO(lines.join("\n").slice(0, 14000));
  // 1ª tentativa: barato
  const r1 = await gemini(MODELO_BARATO, prompt);
  addTok(MODELO_BARATO, r1.inTok, r1.outTok);
  const p1 = safeParseAIJson(r1.text);
  const f1 = p1.ok ? mapToFields(p1.data) : [];
  const ppl1 = parsePeople(f1, n);
  // Sinais de risco → escalona p/ flash
  const risco = !soBarato && (
    fx.hasLopsidedRecord(f1) ||
    (esperados > 0 && ppl1.length < esperados) ||
    (esperados === 0 && ppl1.length === 0 && lines.length > 5) ||
    _nomesParecidos(ppl1)          // muitos nomes iguais na página → caso difícil
  );
  if (!risco) return { fields: f1, model: MODELO_BARATO, escalou: false };
  // 2ª tentativa: caro
  try {
    const r2 = await gemini(MODELO_CARO, prompt);
    addTok(MODELO_CARO, r2.inTok, r2.outTok);
    const p2 = safeParseAIJson(r2.text);
    const f2 = p2.ok ? mapToFields(p2.data) : [];
    const ppl2 = parsePeople(f2, n);
    // fica com o que trouxe MAIS pessoas (ou mais campos em empate)
    const melhor = ppl2.length > ppl1.length || (ppl2.length === ppl1.length && f2.length > f1.length);
    ckpt.escaladas.push(n);
    return melhor ? { fields: f2, model: MODELO_CARO, escalou: true } : { fields: f1, model: MODELO_BARATO, escalou: true };
  } catch (err) { if (err.quota) throw err; return { fields: f1, model: MODELO_BARATO, escalou: false }; }
}

// ── Gera o Excel consolidado a partir do checkpoint ──
function gerarExcel() {
  const pageResults = Object.entries(ckpt.pages).map(([n, v]) => ({ page: Number(n), fields: v.fields || [], people: [], tables: [], warnings: [] })).sort((a, b) => a.page - b.page);
  if (!pageResults.length) return { pessoas: 0, cols: 0 };
  const excel = generateExcel(consolidateDocument(pageResults, { documentName: "DocXtract_lote" }), { clientMode: true });
  writeFileSync(OUT_XLSX, excel.buffer);
  const rows = XLSX.utils.sheet_to_json(XLSX.read(excel.buffer, { type: "buffer" }).Sheets["Pessoas"], { header: 1 });
  return { pessoas: rows.length - 1, cols: (rows[0] || []).length };
}
function custoTotal() { let usd = 0; for (const [m, t] of Object.entries(ckpt.tokens)) { const p = PRECO[m] || { in: 0, out: 0 }; usd += (t.in * p.in + t.out * p.out) / 1e6; } return usd; }

// ═══ LOOP PRINCIPAL (paralelo) ═══
console.log(`\nDocXtract — extração em lote`);
console.log(`PDF: ${doc.numPages} páginas · processando ${P1}–${P2}`);
console.log(soBarato
  ? `Modelo: SÓ o barato — escalonamento DESLIGADO (--so-barato ativo)`
  : `Modelo: barato + ESCALONAMENTO p/ o caro LIGADO ⚠️  (páginas difíceis podem gerar uma segunda chamada; use --so-barato p/ desligar)`);
console.log(`Paralelismo: ${CONCURRENCY} páginas ao mesmo tempo · Retomável: se parar, rode de novo.\n`);

const pendentes = [];
for (let n = P1; n <= P2; n++) if (!ckpt.pages[n]) pendentes.push(n);
const total = P2 - P1 + 1;
let feitas = total - pendentes.length, erros = 0, cotaAcabou = false, tetoAtingido = false, cursor = 0;
const t0 = Date.now();
if (TETO_BRL !== Infinity) console.log(`💰 Teto estimado: R$${TETO_BRL}; chamadas já iniciadas podem ultrapassar esse valor.\n`);

async function worker() {
  while (cursor < pendentes.length && !cotaAcabou && !tetoAtingido) {
    const n = pendentes[cursor++];
    try {
      const { fields, model, escalou } = await extrairPagina(n);
      ckpt.pages[n] = { fields, model };
      feitas++;
      const ppl = parsePeople(fields, n).length;
      process.stdout.write(`  ${feitas}/${total} · pág ${n}: ${ppl} pessoa(s)${escalou ? " ⬆flash" : ""} · ${erros} erro · R$${(custoTotal() * USD_BRL).toFixed(2)}       \r`);
    } catch (err) {
      if (err.quota) { cotaAcabou = true; console.log(`\n⛔ Cota do Gemini esgotada na pág ${n}. Progresso salvo — rode de novo para continuar.`); log(`COTA na pág ${n}`); return; }
      erros++; ckpt.erros.push(n); log(`ERRO pág ${n}: FALHA_PROCESSAMENTO`);
    }
    // Teto de gasto atingido → para limpo (progresso salvo, retomável)
    if (custoTotal() * USD_BRL >= TETO_BRL && !tetoAtingido) {
      tetoAtingido = true; saveCkpt();
      console.log(`\n🛑 Teto estimado de R$${TETO_BRL} atingido. Progresso salvo — rode de novo (aumente o --max) para continuar.`);
      log(`TETO R$${TETO_BRL} atingido na pág ${n}`); return;
    }
    if (feitas % SALVA_A_CADA === 0) { saveCkpt(); const g = gerarExcel(); process.stdout.write(`\n  💾 checkpoint + Excel: ${g.pessoas} pessoas · R$${(custoTotal() * USD_BRL).toFixed(2)}\n`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
saveCkpt();
const g = gerarExcel();
const usd = custoTotal();
console.log(`\n\n════════ FIM ${cotaAcabou ? "(parou por COTA — retomável)" : tetoAtingido ? "(parou no TETO — retomável)" : ""} ════════`);
console.log(`Páginas processadas : ${Object.keys(ckpt.pages).length} de ${doc.numPages}`);
console.log(`Erros               : ${ckpt.erros.length}${ckpt.erros.length ? " (págs: " + ckpt.erros.slice(0, 20).join(",") + "…)" : ""}`);
console.log(`Escalonadas p/ flash: ${ckpt.escaladas.length}`);
console.log(`Tempo               : ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.log(`Custo estimado      : $${usd.toFixed(2)} (R$${(usd * USD_BRL).toFixed(2)})`);
console.log(`\n📊 Excel: ${OUT_XLSX}`);
console.log(`   ${g.pessoas} pessoas × ${g.cols} colunas`);
console.log(`📝 Log de erros: ${OUT_LOG}`);
if (!cotaAcabou && Object.keys(ckpt.pages).length >= (P2 - P1 + 1)) console.log(`\n✅ Lote completo.`);
