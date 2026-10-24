// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  pivotNumberedFieldsToPeople,
  generateExcel,
} from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail}`));
  cond ? pass++ : fail++;
};




console.log("═══ CASO 1: 3 páginas × 2 pessoas = 6 pessoas ═══");
const threePages = [];
["PESSOA FICTICIA 035", "PESSOA FICTICIA 036", "P3"].forEach((pTag, i) => {
  const pageNum = i + 1;
  threePages.push(
    { name: "Nome completo (1)",        value: `PESSOA FICTICIA ALFA_${pTag}`,         page: pageNum, confidence: 1 },
    { name: "Telefone com DDD (1)",     value: `11.9000000${pageNum}1`, page: pageNum, confidence: 1 },
    { name: "Cidade (1)",               value: "CIDADE FICTICIA 001",             page: pageNum, confidence: 1 },
    { name: "Data de nascimento (1)",   value: "02.02.2001",            page: pageNum, confidence: 1 },
    { name: "E-mail ou instagram (1)",  value: `pessoa005@example.test`,   page: pageNum, confidence: 1 },

    { name: "Nome completo (2)",        value: `PESSOA FICTICIA BETA_${pTag}`,         page: pageNum, confidence: 1 },
    { name: "Telefone com DDD (2)",     value: `11.9000000${pageNum}2`, page: pageNum, confidence: 1 },
    { name: "Cidade (2)",               value: "CIDADE FICTICIA 001",             page: pageNum, confidence: 1 },
    { name: "Data de nascimento (2)",   value: "02.02.2001",            page: pageNum, confidence: 1 },
    { name: "E-mail ou instagram (2)",  value: `pessoa006@example.test`,   page: pageNum, confidence: 1 },
  );
});

const r1 = pivotNumberedFieldsToPeople(threePages);
check("Total = 6 pessoas (não só a última página)", r1.length === 6, `recebido ${r1.length}`);
check("Coluna Página = [1,1,2,2,3,3]",
  JSON.stringify(r1.map(p => p.page)) === JSON.stringify([1, 1, 2, 2, 3, 3]),
  `recebido ${JSON.stringify(r1.map(p => p.page))}`);
check("Pessoa #1 = PESSOA FICTICIA ALFA_PESSOA FICTICIA 035 (pág 1)",     r1[0].nome_completo === "PESSOA FICTICIA ALFA_PESSOA FICTICIA 035" && r1[0].page === 1);
check("Pessoa #2 = PESSOA FICTICIA BETA_PESSOA FICTICIA 035 (pág 1)",     r1[1].nome_completo === "PESSOA FICTICIA BETA_PESSOA FICTICIA 035" && r1[1].page === 1);
check("Pessoa #3 = PESSOA FICTICIA ALFA_PESSOA FICTICIA 036 (pág 2)",     r1[2].nome_completo === "PESSOA FICTICIA ALFA_PESSOA FICTICIA 036" && r1[2].page === 2);
check("Pessoa #4 = PESSOA FICTICIA BETA_PESSOA FICTICIA 036 (pág 2)",     r1[3].nome_completo === "PESSOA FICTICIA BETA_PESSOA FICTICIA 036" && r1[3].page === 2);
check("Pessoa #5 = PESSOA FICTICIA ALFA_P3 (pág 3)",     r1[4].nome_completo === "PESSOA FICTICIA ALFA_P3" && r1[4].page === 3);
check("Pessoa #6 = PESSOA FICTICIA BETA_P3 (pág 3)",     r1[5].nome_completo === "PESSOA FICTICIA BETA_P3" && r1[5].page === 3);




console.log("\n═══ CASO 2: 15 páginas × 5 pessoas = 75 pessoas ═══");
const fields15 = [];
for (let pg = 1; pg <= 15; pg++) {
  for (let i = 1; i <= 5; i++) {
    fields15.push({
      name: `Nome completo (${i})`, value: `Pessoa Ficticia P${pg} I${i}`,
      page: pg, confidence: 1,
    });
    fields15.push({
      name: `Telefone com DDD (${i})`, value: `1199999${pg.toString().padStart(2,"0")}${i}`,
      page: pg, confidence: 1,
    });
  }
}
const r2 = pivotNumberedFieldsToPeople(fields15);
check("Total = 75 pessoas", r2.length === 75, `recebido ${r2.length}`);

check("Primeira pessoa: Pessoa Ficticia P1 I1 (pág 1)",  r2[0].nome_completo === "Pessoa Ficticia P1 I1" && r2[0].page === 1);
check("Última pessoa: Pessoa Ficticia P15 I5 (pág 15)",  r2[74].nome_completo === "Pessoa Ficticia P15 I5" && r2[74].page === 15);


const peoplePerPage = {};
r2.forEach(p => { peoplePerPage[p.page] = (peoplePerPage[p.page] || 0) + 1; });
const allPagesHave5 = Object.keys(peoplePerPage).length === 15 &&
  Object.values(peoplePerPage).every(v => v === 5);
check("Todas as 15 páginas têm exatamente 5 pessoas cada",
  allPagesHave5,
  `distribuição: ${JSON.stringify(peoplePerPage)}`);




console.log("\n═══ CASO 3: Excel gerado com 75 pessoas ═══");
const doc15 = {
  document_name: "lista_grande.pdf",
  generated_at: new Date().toISOString(),
  total_pages: 15,
  fields: fields15,
  people: [],
  tables: [], warnings: [], rows: [], headers: [],
};
const xlsxResult = generateExcel(doc15);
const wb = XLSX.read(xlsxResult.buffer, { type: "buffer" });
check("Excel tem aba Pessoas", wb.SheetNames.includes("Pessoas"));
check("Pessoas é a 1ª aba",    wb.SheetNames[0] === "Pessoas");
const pessoasRows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
check("Aba Pessoas tem 76 linhas (1 header + 75 pessoas)", pessoasRows.length === 76, `tem ${pessoasRows.length}`);
check("Primeira pessoa no Excel = Pessoa Ficticia P1 I1, pág 1",
  pessoasRows[1][0] === "Pessoa Ficticia P1 I1" && pessoasRows[1][pessoasRows[1].length - 1] === 1);
check("Última pessoa no Excel = Pessoa Ficticia P15 I5, pág 15",
  pessoasRows[75][0] === "Pessoa Ficticia P15 I5" && pessoasRows[75][pessoasRows[75].length - 1] === 15);




console.log("\n═══ CASO 4: documento de 1 página continua funcionando ═══");
const singlePage = [
  { name: "Nome completo (1)", value: "PESSOA FICTICIA 039",          page: 1, confidence: 1 },
  { name: "Telefone com DDD (1)", value: "11900000009",  page: 1, confidence: 1 },
  { name: "Nome completo (2)", value: "PESSOA FICTICIA 040",        page: 1, confidence: 1 },
  { name: "Telefone com DDD (2)", value: "11900000016",  page: 1, confidence: 1 },
];
const r4 = pivotNumberedFieldsToPeople(singlePage);
check("1 página com 2 pessoas → 2 pessoas", r4.length === 2);
check("Ambas têm página 1", r4.every(p => p.page === 1));
check("Ordem por índice: Samuel, Fernando",
  r4[0].nome_completo === "PESSOA FICTICIA 039" && r4[1].nome_completo === "PESSOA FICTICIA 040");




console.log("\n═══ CASO 5: páginas fora de ordem no input ═══");
const outOfOrder = [
  { name: "Nome completo (1)", value: "PESSOA FICTICIA 041", page: 3, confidence: 1 },
  { name: "Nome completo (1)", value: "PESSOA FICTICIA 042", page: 1, confidence: 1 },
  { name: "Nome completo (1)", value: "PESSOA FICTICIA 043", page: 2, confidence: 1 },
];
const r5 = pivotNumberedFieldsToPeople(outOfOrder);
check("3 pessoas extraídas (uma por página)", r5.length === 3);
check("Ordem por página: 1, 2, 3", r5.map(p => p.page).join(",") === "1,2,3");
check("Valores correspondentes: PESSOA FICTICIA 042, PESSOA FICTICIA 043, PESSOA FICTICIA 041",
  r5[0].nome_completo === "PESSOA FICTICIA 042" &&
  r5[1].nome_completo === "PESSOA FICTICIA 043" &&
  r5[2].nome_completo === "PESSOA FICTICIA 041");

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
