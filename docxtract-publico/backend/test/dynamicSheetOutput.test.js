// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail}`));
  cond ? pass++ : fail++;
};

const base = (over) => ({
  document_name: "doc.png",
  generated_at: new Date().toISOString(),
  total_pages: 1,
  fields: [], people: [], tables: [], warnings: [], rows: [], headers: [],
  ...over,
});

const MAT_HEADERS = ["Item","C","I","Material","Texto breve","Qtd.soli.","Unidade","Preço a.","Val.total","T","Data de remessa"];
const MAT_ROWS = [
  ["10","P","—","5335047","TUBO CONC ARMADO 2M 1M","1","UN","1.800,00","1.800,00","D","09.06.2026"],
  ["20","P","—","5330833","TUBO CONCR ARM MF 600X1000X60MM","35","UN","260,00","9.100,00","D","09.06.2026"],
  ["30","P","—","5339285","LAJE RED CONC ARM CONC 2500X600MM","1","UN","1.990,00","1.990,00","D","09.06.2026"],
];




console.log("═══ CASO 1: ficha de pessoas → só aba Pessoas ═══");
const r1 = generateExcel(base({
  people: [
    { nome_completo: "FICTICIOAAV FICTICIOABD", telefone: "(44) 22222-1111", cidade: "FICTICIOABE", data_nascimento: "08/01/1990", email_ou_instagram: "contatoadf@example.test", page: 1 },
  ],
}), { clientMode: true });
const wb1 = XLSX.read(r1.buffer, { type: "buffer" });
check("1 aba só", wb1.SheetNames.length === 1, wb1.SheetNames.join(","));
check("Aba = Pessoas", wb1.SheetNames[0] === "Pessoas");




console.log("\n═══ CASO 2: tabela de materiais (people vazio) → só aba Itens ═══");
const r2 = generateExcel(base({
  tables: [{ title: "Itens", page: 1, headers: MAT_HEADERS, rows: MAT_ROWS }],
}), { clientMode: true });
const wb2 = XLSX.read(r2.buffer, { type: "buffer" });
check("Apenas 1 aba", wb2.SheetNames.length === 1, wb2.SheetNames.join(","));
check("Aba se chama 'Itens'", wb2.SheetNames[0] === "Itens", wb2.SheetNames[0]);
check("NÃO existe aba Pessoas", !wb2.SheetNames.includes("Pessoas"));
const g2 = XLSX.utils.sheet_to_json(wb2.Sheets["Itens"], { header: 1 });
check("Cabeçalhos preservados",
  JSON.stringify(g2[0].slice(0, MAT_HEADERS.length)) === JSON.stringify(MAT_HEADERS),
  JSON.stringify(g2[0]));
check("3 linhas de itens", g2.length - 1 === 3, `tem ${g2.length-1}`);
check("Código do material preservado (5335047)", g2[1][3] === "5335047");
check("Preço formato BR preservado (1.800,00)", g2[1][7] === "1.800,00");
check("NÃO tem coluna Nome completo / Telefone / E-mail",
  !g2[0].some(h => /nome completo|telefone|e-mail|instagram/i.test(String(h))));




console.log("\n═══ CASO 3: 3 páginas de tabela → consolida em 1 aba Itens ═══");
const r3 = generateExcel(base({
  total_pages: 3,
  tables: [
    { title: "Itens", page: 1, headers: MAT_HEADERS, rows: [MAT_ROWS[0]] },
    { title: "Itens", page: 2, headers: MAT_HEADERS, rows: [MAT_ROWS[1]] },
    { title: "Itens", page: 3, headers: MAT_HEADERS, rows: [MAT_ROWS[2]] },
  ],
}), { clientMode: true });
const wb3 = XLSX.read(r3.buffer, { type: "buffer" });
check("Apenas 1 aba", wb3.SheetNames.length === 1, wb3.SheetNames.join(","));
check("Aba = Itens", wb3.SheetNames[0] === "Itens");
const g3 = XLSX.utils.sheet_to_json(wb3.Sheets["Itens"], { header: 1 });
check("3 itens consolidados (1 header + 3)", g3.length === 4, `tem ${g3.length}`);
check("Header tem coluna Página ao final", String(g3[0][g3[0].length - 1]).toLowerCase() === "página");
const pageColIdx = g3[0].length - 1;
check("Coluna Página = 1, 2, 3",
  [g3[1][pageColIdx], g3[2][pageColIdx], g3[3][pageColIdx]].join(",") === "1,2,3",
  `${[g3[1][pageColIdx], g3[2][pageColIdx], g3[3][pageColIdx]].join(",")}`);
check("Cabeçalho NÃO repetido no meio",
  g3[2][0] !== "Item" && g3[3][0] !== "Item");




console.log("\n═══ CASO 4: tabela genérica → aba Tabela ═══");
const r4 = generateExcel(base({
  tables: [{ title: "T", page: 1, headers: ["Coluna A", "Coluna B", "Coluna C"], rows: [["x","y","z"],["1","2","3"]] }],
}), { clientMode: true });
const wb4 = XLSX.read(r4.buffer, { type: "buffer" });
check("Aba = Tabela (não Itens)", wb4.SheetNames[0] === "Tabela", wb4.SheetNames[0]);
check("NÃO existe Pessoas", !wb4.SheetNames.includes("Pessoas"));




console.log("\n═══ CASO 5: campos soltos (sem pessoas/tabelas) → aba Dados ═══");
const r5 = generateExcel(base({
  fields: [
    { name: "Empresa", value: "ACME LTDA", page: 1, confidence: 0.9 },
    { name: "CNPJ", value: "45.678.901/3334-23", page: 1, confidence: 0.9 },
  ],
}), { clientMode: true });
const wb5 = XLSX.read(r5.buffer, { type: "buffer" });
check("Aba = Dados", wb5.SheetNames[0] === "Dados", wb5.SheetNames[0]);
check("NÃO existe Pessoas vazia", !wb5.SheetNames.includes("Pessoas"));




console.log("\n═══ CASO 6: pessoas têm prioridade sobre tabelas ═══");
const r6 = generateExcel(base({
  people: [{ nome_completo: "FICTICIOABF", telefone: "(44) 23333-3333", cidade: "FICTICIOABE", data_nascimento: "08/01/2000", email_ou_instagram: "", page: 1 }],
  tables: [{ title: "Itens", page: 1, headers: MAT_HEADERS, rows: MAT_ROWS }],
}), { clientMode: true });
const wb6 = XLSX.read(r6.buffer, { type: "buffer" });
check("Aba = Pessoas (prioridade — primeira aba)", wb6.SheetNames[0] === "Pessoas");



check("Tabela NÃO é mais descartada (aba Itens presente)", wb6.SheetNames.includes("Itens"),
  wb6.SheetNames.join(","));
const g6 = XLSX.utils.sheet_to_json(wb6.Sheets["Itens"], { header: 1 });
check("Linhas da tabela preservadas junto com pessoas", g6.length - 1 === MAT_ROWS.length,
  `tem ${g6.length - 1}`);




console.log("\n═══ CASO 7: documento vazio → Pessoas vazia (último caso) ═══");
const r7 = generateExcel(base({}), { clientMode: true });
const wb7 = XLSX.read(r7.buffer, { type: "buffer" });
check("1 aba só", wb7.SheetNames.length === 1, wb7.SheetNames.join(","));
check("Aba = Pessoas (vazia, fallback extremo)", wb7.SheetNames[0] === "Pessoas");




console.log("\n═══ CASO 8: tabela não gera abas técnicas ═══");
const FORBIDDEN = ["Dados", "Para Revisar", "Tabelas", "Avisos", "Auditoria", "Pessoas"];
const stillForbidden = FORBIDDEN.filter(s => wb2.SheetNames.includes(s));
check("Tabela de materiais não tem Dados/Revisar/Avisos/Auditoria/Pessoas",
  stillForbidden.length === 0, `apareceram: ${stillForbidden.join(",")}`);

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
