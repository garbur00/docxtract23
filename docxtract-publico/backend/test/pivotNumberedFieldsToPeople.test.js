// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  pivotNumberedFieldsToPeople,
  extractPeopleFromNumberedFields,
  generateExcel,
} from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};




console.log("═══ CENÁRIO SINTÉTICO: \"Nome completo (1)\" com parênteses ═══");

const fieldsSinteticos = [
  { name: "Nome completo (1)",       value: "PESSOA FICTICIA 044",   page: 1 },
  { name: "Telefone com DDD (1)",    value: "11.900000-011",             page: 1 },
  { name: "Cidade (1)",              value: "CIDADE FICTICIA 001",                 page: 1 },
  { name: "Data de nascimento (1)",  value: "05.04.2002",                page: 1 },
  { name: "E-mail ou instagram (1)", value: "pessoa003@example.test",      page: 1 },

  { name: "Nome completo (2)",       value: "PESSOA FICTICIA 045", page: 1 },
  { name: "Telefone com DDD (2)",    value: "11.90000-0012",              page: 1 },
  { name: "Cidade (2)",              value: "CIDADE FICTICIA 001",                  page: 1 },
  { name: "Data de nascimento (2)",  value: "02.01.2009",                 page: 1 },
  { name: "E-mail ou instagram (2)", value: "pessoa001@example.test", page: 1 },
];

const result = pivotNumberedFieldsToPeople(fieldsSinteticos);

console.log("\nSaída da função:");
console.log(JSON.stringify(result.map(p => ({
  nome_completo: p.nome_completo,
  telefone: p.telefone,
  cidade: p.cidade,
  data_nascimento: p.data_nascimento,
  email_ou_instagram: p.email_ou_instagram,
  page: p.page,
})), null, 2));

console.log("\nValidações:");
check("Retornou 2 pessoas",                       result.length === 2);


check("#1 nome = PESSOA FICTICIA 044",        result[0]?.nome_completo === "PESSOA FICTICIA 044");
check("#1 telefone = (11) 90000-0011",            result[0]?.telefone === "(11) 90000-0011", `obteve "${result[0]?.telefone}"`);
check("#1 cidade = CIDADE FICTICIA 001",                    result[0]?.cidade === "CIDADE FICTICIA 001");
check("#1 data = 05/04/2002",                     result[0]?.data_nascimento === "05/04/2002", `obteve "${result[0]?.data_nascimento}"`);
check("#1 email = pessoa003@example.test",          result[0]?.email_ou_instagram === "pessoa003@example.test", `obteve "${result[0]?.email_ou_instagram}"`);
check("#1 page = 1",                              result[0]?.page === 1);


check("#2 nome = PESSOA FICTICIA 045",     result[1]?.nome_completo === "PESSOA FICTICIA 045");
check("#2 telefone = (11) 90000-0012",            result[1]?.telefone === "(11) 90000-0012", `obteve "${result[1]?.telefone}"`);
check("#2 data = 02/01/2009",                     result[1]?.data_nascimento === "02/01/2009", `obteve "${result[1]?.data_nascimento}"`);
check("#2 email = pessoa001@example.test",    result[1]?.email_ou_instagram === "pessoa001@example.test");




console.log("\n═══ Os 4 formatos de índice funcionam ═══");
const multiFormat = [
  { name: "Nome completo (1)",  value: "A", page: 1 },
  { name: "Nome completo_2",    value: "B", page: 1 },
  { name: "Nome completo 3",    value: "C", page: 1 },
  { name: "Nome completo4",     value: "D", page: 1 },
];
const r2 = pivotNumberedFieldsToPeople(multiFormat);
check("4 pessoas extraídas (todos os formatos)", r2.length === 4, `obteve ${r2.length}`);
check("(1) → A", r2[0]?.nome_completo === "A");
check("_2 → B",  r2[1]?.nome_completo === "B");
check(" 3 → C",  r2[2]?.nome_completo === "C");
check("4 → D",   r2[3]?.nome_completo === "D");




console.log("\n═══ Alias antigo continua existindo ═══");
const r3 = extractPeopleFromNumberedFields(fieldsSinteticos);
check("extractPeopleFromNumberedFields = pivotNumberedFieldsToPeople", r3.length === 2);




console.log("\n═══ Excel gerado: aba Pessoas em 1º lugar, 6 colunas ═══");
const exc = generateExcel({
  document_name: "ficha.pdf",
  generated_at: new Date().toISOString(),
  fields: fieldsSinteticos,
  people: [],
  tables: [],
  warnings: [],
});
const wb = XLSX.read(exc.buffer, { type: "buffer" });
console.log("Abas (em ordem):", wb.SheetNames.join(" → "));
check("'Pessoas' é a PRIMEIRA aba", wb.SheetNames[0] === "Pessoas");
const pessoasGrid = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
check("Header tem 6 colunas", pessoasGrid[0].length === 6, `tem ${pessoasGrid[0].length}`);
check("Header = Nome completo|Telefone|Cidade|Data de nascimento|E-mail/Instagram|Página",
  JSON.stringify(pessoasGrid[0]) === JSON.stringify(["Nome completo","Telefone","Cidade","Data de nascimento","E-mail/Instagram","Página"]),
  `obteve ${JSON.stringify(pessoasGrid[0])}`);
check("Linha 1 contém pessoa ficticia 044 normalizada",
  pessoasGrid[1][0] === "PESSOA FICTICIA 044" &&
  pessoasGrid[1][1] === "(11) 90000-0011" &&
  pessoasGrid[1][3] === "05/04/2002" &&
  pessoasGrid[1][4] === "pessoa003@example.test");
check("Linha 2 contém pessoa ficticia 045 normalizada",
  pessoasGrid[2][0] === "PESSOA FICTICIA 045" &&
  pessoasGrid[2][1] === "(11) 90000-0012" &&
  pessoasGrid[2][3] === "02/01/2009" &&
  pessoasGrid[2][4] === "pessoa001@example.test");

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
