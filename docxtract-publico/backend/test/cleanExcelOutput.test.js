// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail}`));
  cond ? pass++ : fail++;
};

const FORBIDDEN_SHEETS = ["Dados", "Para Revisar", "Tabelas", "Avisos", "Auditoria"];


function buildFields(pages, perPage) {
  const fields = [];
  for (let pg = 1; pg <= pages; pg++) {
    for (let i = 1; i <= perPage; i++) {
      fields.push({ name: `Nome completo (${i})`,       value: `PESSOA-P${pg}-N${i}`,  page: pg, confidence: 1, warnings: [] });
      fields.push({ name: `Telefone com DDD (${i})`,    value: `119${pg}0${i}1888`,    page: pg, confidence: 1, warnings: [] });
      fields.push({ name: `Cidade (${i})`,              value: "FICTICIOABR FICTICIOABS",            page: pg, confidence: 1, warnings: [] });
      fields.push({ name: `Data de nascimento (${i})`,  value: "20.08.1983",           page: pg, confidence: 1, warnings: [] });
      fields.push({ name: `E-mail ou instagram (${i})`, value: i % 2 ? "CONTATOADQ@example.test" : "", page: pg, confidence: 1, warnings: [] });
    }
  }
  return fields;
}

const docFrom = (fields, name = "lista.pdf") => ({
  document_name: name,
  generated_at: new Date().toISOString(),
  total_pages: Math.max(...fields.map(f => f.page)),
  fields, people: [], tables: [], warnings: [], rows: [], headers: [],
});




console.log("═══ CASO 1: 3 páginas × 5 pessoas, só aba Pessoas ═══");
const f1 = buildFields(3, 5);
const r1 = generateExcel(docFrom(f1), { clientMode: true });
const wb1 = XLSX.read(r1.buffer, { type: "buffer" });

check("Workbook tem exatamente 1 aba", wb1.SheetNames.length === 1, `tem ${wb1.SheetNames.length}: ${wb1.SheetNames.join(",")}`);
check("Única aba se chama 'Pessoas'", wb1.SheetNames[0] === "Pessoas");
FORBIDDEN_SHEETS.forEach(s =>
  check(`NÃO tem aba '${s}'`, !wb1.SheetNames.includes(s))
);

const grid1 = XLSX.utils.sheet_to_json(wb1.Sheets["Pessoas"], { header: 1 });
check("Header correto (6 colunas)",
  JSON.stringify(grid1[0]) === JSON.stringify(["Nome completo","Telefone","Cidade","Data de nascimento","E-mail/Instagram","Página"]),
  JSON.stringify(grid1[0]));
check("15 pessoas (16 linhas com header)", grid1.length === 16, `tem ${grid1.length}`);
check("Coluna Página tem valores 1, 2 e 3",
  [...new Set(grid1.slice(1).map(r => r[5]))].sort().join(",") === "1,2,3");
check("Telefone normalizado (11) 9X0X-1888",
  /^\(11\) 9\d0\d-1888$/.test(grid1[1][1]), `obteve "${grid1[1][1]}"`);
check("Data normalizada 20/08/1983", grid1[1][3] === "20/08/1983", `obteve "${grid1[1][3]}"`);
check("E-mail minúsculo contatoadq@example.test", grid1[1][4] === "contatoadq@example.test", `obteve "${grid1[1][4]}"`);
check("Campo vazio fica vazio (não null/N/A)",
  grid1[2][4] === "" || grid1[2][4] === undefined, `obteve "${grid1[2][4]}"`);


const hasCampoValor1 = Object.keys(wb1.Sheets).some(sn => {
  const g = XLSX.utils.sheet_to_json(wb1.Sheets[sn], { header: 1 });
  return g[0] && g[0][0] === "Campo" && g[0][1] === "Valor";
});
check("NÃO existe formato Campo|Valor|Página", !hasCampoValor1);




console.log("\n═══ CASO 2: 15 páginas × 5 pessoas = 75 pessoas ═══");
const f2 = buildFields(15, 5);
const r2 = generateExcel(docFrom(f2), { clientMode: true });
const wb2 = XLSX.read(r2.buffer, { type: "buffer" });
check("Apenas 1 aba", wb2.SheetNames.length === 1, wb2.SheetNames.join(","));
check("Aba = Pessoas", wb2.SheetNames[0] === "Pessoas");
const grid2 = XLSX.utils.sheet_to_json(wb2.Sheets["Pessoas"], { header: 1 });
check("75 pessoas (76 linhas)", grid2.length === 76, `tem ${grid2.length}`);
const pagesSet = new Set(grid2.slice(1).map(r => r[5]));
check("Todas as 15 páginas representadas", pagesSet.size === 15, `tem ${pagesSet.size}`);
check("Primeira pessoa pág 1", grid2[1][5] === 1);
check("Última pessoa pág 15", grid2[75][5] === 15);





console.log("\n═══ CASO 3: sem pessoas → Dados (com campos) ou Pessoas (vazio total) ═══");

const r3a = generateExcel(docFrom([{ name: "Total", value: "R$ 10", page: 1, confidence: 1, warnings: [] }]), { clientMode: true });
const wb3a = XLSX.read(r3a.buffer, { type: "buffer" });
check("Com campos soltos → 1 aba", wb3a.SheetNames.length === 1, wb3a.SheetNames.join(","));
check("Com campos soltos → aba 'Dados'", wb3a.SheetNames[0] === "Dados", wb3a.SheetNames[0]);
check("NÃO força Pessoas quando há campos", !wb3a.SheetNames.includes("Pessoas"));

const r3b = generateExcel(docFrom([]), { clientMode: true });
const wb3b = XLSX.read(r3b.buffer, { type: "buffer" });
check("Vazio total → 1 aba", wb3b.SheetNames.length === 1, wb3b.SheetNames.join(","));
check("Vazio total → Pessoas (fallback extremo)", wb3b.SheetNames[0] === "Pessoas");





console.log("\n═══ CASO 4: modo técnico (clientMode:false) mantém abas internas ═══");
const r4 = generateExcel(docFrom(buildFields(2, 3)), { clientMode: false });
const wb4 = XLSX.read(r4.buffer, { type: "buffer" });
check("Modo técnico tem Pessoas", wb4.SheetNames.includes("Pessoas"));
check("Modo técnico tem Auditoria (lógica preservada)", wb4.SheetNames.includes("Auditoria"));
check("Modo técnico tem mais de 1 aba", wb4.SheetNames.length > 1, `tem ${wb4.SheetNames.length}`);




console.log("\n═══ CASO 5: default sem options = técnico (rota é quem liga clientMode) ═══");
const r5 = generateExcel(docFrom(buildFields(1, 2)));
const wb5 = XLSX.read(r5.buffer, { type: "buffer" });
check("Default mantém compat (>1 aba)", wb5.SheetNames.length > 1, `tem ${wb5.SheetNames.length}`);

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
