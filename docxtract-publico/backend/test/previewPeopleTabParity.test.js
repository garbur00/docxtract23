// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";
import { clientBuildPeopleTable } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};

const person = (nome, extra, page = 1) => ({
  nome_completo: nome, telefone: extra.telefone ?? null, cidade: extra.cidade ?? null,
  data_nascimento: extra.data_nascimento ?? null, email_ou_instagram: extra.email ?? null,
  funcao_cargo: null, extra_fields: extra.extra ?? {}, confidence: 0.9,
  needs_review: false, warnings: [], page,
});


const people = [
  person("PESSOA FICTICIA 047", { telefone: "(11) 90000-0007", cidade: "CIDADE FICTICIA 002", data_nascimento: "01/09/2008",
    extra: { "Pai": "PESSOA FICTICIA 048", "Mãe": "PESSOA FICTICIA 002", "CEP": "90000002", "CPF": "90000000418", "Número SUS": "90000000000006" } }),
  person("PESSOA FICTICIA 049", { telefone: "(11) 90000-0005", cidade: "CIDADE FICTICIA 002", data_nascimento: "08/08/2007",
    extra: { "Pai": "PESSOA FICTICIA 011", "Mãe": "PESSOA FICTICIA 004", "CEP": "90000003", "CPF": "90000000175", "Número SUS": "90000000000007" } }),
];

const preview = clientBuildPeopleTable(people, []);
const excel = generateExcel({ document_name: "parity", fields: [], people, tables: [], warnings: [], rows: [], headers: [] }, { clientMode: true });
const wb = XLSX.read(excel.buffer, { type: "buffer" });
const excelAoa = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
const excelHead = excelAoa[0];
const excelRows = excelAoa.slice(1);

console.log("═══ Colunas do preview == colunas do Excel ═══");
check("Cabeçalhos idênticos (ordem inclusa)",
  JSON.stringify(preview.headers) === JSON.stringify(excelHead),
  `preview=${JSON.stringify(preview.headers)}\n       excel=${JSON.stringify(excelHead)}`);
check("Coluna E-mail/Instagram AUSENTE (adaptativo, doc sem e-mail)",
  !preview.headers.includes("E-mail/Instagram"));
check("Colunas dinâmicas presentes (Pai, Mãe, CEP, CPF, Número SUS)",
  ["Pai", "Mãe", "CEP", "CPF", "Número SUS"].every(c => preview.headers.includes(c)));

console.log("\n═══ Linhas do preview == linhas do Excel ═══");
check("Mesmo nº de linhas", preview.rows.length === excelRows.length, `${preview.rows.length} vs ${excelRows.length}`);
check("Linha 1 idêntica célula a célula",
  JSON.stringify(preview.rows[0].map(String)) === JSON.stringify(excelRows[0].map(String)),
  `\n  preview=${JSON.stringify(preview.rows[0])}\n  excel=${JSON.stringify(excelRows[0])}`);
check("Linha 2 idêntica célula a célula",
  JSON.stringify(preview.rows[1].map(String)) === JSON.stringify(excelRows[1].map(String)));

console.log("\n═══ Documento COM e-mail → coluna aparece nos dois ═══");
const comEmail = [person("PESSOA FICTICIA 050", { telefone: "(11) 90000-0001", email: "pessoa007@example.test", extra: {} })];
const pv2 = clientBuildPeopleTable(comEmail, []);
const wb2 = XLSX.read(generateExcel({ document_name: "e", fields: [], people: comEmail, tables: [], warnings: [], rows: [], headers: [] }, { clientMode: true }).buffer, { type: "buffer" });
const head2 = XLSX.utils.sheet_to_json(wb2.Sheets["Pessoas"], { header: 1 })[0];
check("Preview e Excel concordam com e-mail presente",
  pv2.headers.includes("E-mail/Instagram") && JSON.stringify(pv2.headers) === JSON.stringify(head2),
  `${JSON.stringify(pv2.headers)} vs ${JSON.stringify(head2)}`);
check("Sem Cidade/Nascimento vazios (adaptativo)",
  !pv2.headers.includes("Cidade") && !pv2.headers.includes("Data de nascimento"));

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
