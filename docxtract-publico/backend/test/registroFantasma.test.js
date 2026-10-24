// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel, isEmptyPerson, isBlankish } from "../src/services/excelService.js";
import { clientIsEmptyPerson } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const person = (nome) => ({
  nome_completo: nome, telefone: null, cidade: null, data_nascimento: null,
  email_ou_instagram: null, funcao_cargo: null, extra_fields: {}, page: 1,
});

console.log("═══ isBlankish reconhece tokens null-like ═══");
for (const v of [null, undefined, "", "  ", "null", "NULL", "N/A", "n/a", "na", "-", "---", "...", "não informado", "ilegível"]) {
  check(`"${v}" é blankish`, isBlankish(v), JSON.stringify(v));
}
for (const v of ["PESSOA FICTICIA 001", "0", "CIDADE FICTICIA 003", "A", "não sei dizer"]) {
  check(`"${v}" NÃO é blankish (valor real)`, !isBlankish(v));
}

console.log("\n═══ isEmptyPerson filtra fantasmas ═══");
check("Pessoa com nome 'null' é vazia", isEmptyPerson(person("null")));
check("Pessoa com nome 'N/A' é vazia", isEmptyPerson(person("N/A")));
check("Pessoa com nome '-' é vazia", isEmptyPerson(person("-")));
check("Pessoa com nome real NÃO é vazia", !isEmptyPerson(person("PESSOA FICTICIA 051")));

console.log("\n═══ Espelho: clientIsEmptyPerson idêntico ═══");
for (const nome of ["null", "N/A", "-", "", "PESSOA FICTICIA 051"]) {
  check(`"${nome}": backend e frontend concordam`, isEmptyPerson(person(nome)) === clientIsEmptyPerson(person(nome)));
}

console.log("\n═══ Excel: 3 reais + 6 fantasmas → 3 linhas (caso pág 62) ═══");
const people = [
  { ...person("PESSOA FICTICIA 052"), telefone: "(11) 90000-0003", extra_fields: { "Mãe": "PESSOA FICTICIA 053", "CPF": "90000000256" } },
  { ...person("PESSOA FICTICIA 054"), telefone: "(11) 90000-0002", extra_fields: { "Mãe": "PESSOA FICTICIA 055" } },
  { ...person("PESSOA FICTICIA 056"), telefone: "(11) 90000-0004", extra_fields: { "Mãe": "PESSOA FICTICIA 057" } },
  person("null"), person(null), person("N/A"), person("-"), person(""), person("null"),
];
const wb = XLSX.read(generateExcel(
  { document_name: "p62", fields: [], people, tables: [], warnings: [], rows: [], headers: [] },
  { clientMode: true }
).buffer, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
check("Exatamente 3 linhas (fantasmas filtrados)", rows.length - 1 === 3, `obteve ${rows.length - 1}`);
check("Nenhuma célula de nome = 'null'/'N/A'/'-'", !rows.slice(1).some(r => isBlankish(r[0])), JSON.stringify(rows.slice(1).map(r => r[0])));
check("Os 3 nomes reais presentes", ["PESSOA FICTICIA 052", "PESSOA FICTICIA 054", "PESSOA FICTICIA 056"].every(n => rows.some(r => r[0] === n)));

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
