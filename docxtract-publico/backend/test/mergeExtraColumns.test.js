// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel, mergeExtraColumns } from "../src/services/excelService.js";
import { clientBuildPeopleTable } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const person = (nome, extra, page = 1) => ({
  nome_completo: nome, telefone: null, cidade: null, data_nascimento: null,
  email_ou_instagram: null, funcao_cargo: null, extra_fields: extra, page,
});


const people = [
  person("PESSOA FICTICIA 001", { "mãe": "PESSOA FICTICIA 002", "cpf": "90000000418" }, 1),
  person("PESSOA FICTICIA 003", { "mãe": "PESSOA FICTICIA 004", "cpf": "90000000175" }, 1),
  person("PESSOA FICTICIA 005", { "Mãe": "PESSOA FICTICIA 006", "CPF": "90000000337" }, 2),
];

console.log("═══ mergeExtraColumns (unidade) ═══");
const m = mergeExtraColumns(people);
const maeKey = m.keys[m.labels.indexOf("Mãe")];   
check("Uma coluna canônica para Mãe", m.labels.filter(l => l === "Mãe").length === 1, JSON.stringify(m.labels));
check("Uma coluna canônica para CPF", m.labels.filter(l => l === "CPF").length === 1);
check("Só 2 colunas extras (Mãe, CPF)", m.keys.length === 2, JSON.stringify(m.labels));
check("Rótulo com melhor casing: 'Mãe' (não 'mãe')", m.labels.includes("Mãe"), JSON.stringify(m.labels));
check("Rótulo 'CPF' (não 'cpf')", m.labels.includes("CPF"), JSON.stringify(m.labels));
check("valueOf casa case-insensitive (PESSOA FICTICIA 001→PESSOA FICTICIA 010)", m.valueOf(people[0], maeKey) === "PESSOA FICTICIA 002");
check("valueOf PESSOA FICTICIA 005→ELVIRA", m.valueOf(people[2], maeKey) === "PESSOA FICTICIA 006");

console.log("\n═══ Excel: mãe numa coluna só, todos preenchidos ═══");
const wb = XLSX.read(generateExcel(
  { document_name: "x", fields: [], people, tables: [], warnings: [], rows: [], headers: [] },
  { clientMode: true }
).buffer, { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
const head = aoa[0];
check("Só UMA coluna de mãe no Excel", head.filter(h => String(h).toLowerCase() === "mãe").length === 1, JSON.stringify(head));
const maeIdx = head.findIndex(h => String(h).toLowerCase() === "mãe");
const rowOf = (nome) => aoa.find(r => r[0] === nome);
check("PESSOA FICTICIA 001 tem mãe preenchida (não vazio)", rowOf("PESSOA FICTICIA 001")[maeIdx] === "PESSOA FICTICIA 002", `="${rowOf("PESSOA FICTICIA 001")[maeIdx]}"`);
check("PESSOA FICTICIA 003 tem mãe preenchida", rowOf("PESSOA FICTICIA 003")[maeIdx] === "PESSOA FICTICIA 004");
check("PESSOA FICTICIA 005 tem mãe preenchida", rowOf("PESSOA FICTICIA 005")[maeIdx] === "PESSOA FICTICIA 006");

console.log("\n═══ Paridade preview (clientBuildPeopleTable) == Excel ═══");
const pv = clientBuildPeopleTable(people, []);
check("Colunas do preview == colunas do Excel", JSON.stringify(pv.headers) === JSON.stringify(head),
  `\n  prev=${JSON.stringify(pv.headers)}\n  excel=${JSON.stringify(head)}`);
const pvMae = pv.headers.findIndex(h => String(h).toLowerCase() === "mãe");
check("Preview: PESSOA FICTICIA 001→PESSOA FICTICIA 010 na coluna Mãe", pv.rows.find(r => r[0] === "PESSOA FICTICIA 001")[pvMae] === "PESSOA FICTICIA 002");

console.log("\n═══ Merge por ACENTO/pontuação (seguro) — NÃO junta typos ═══");



const variantes = [
  { nome_completo: "A", telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, funcao_cargo: null, extra_fields: { "Frequência Esc.": "Sim" }, page: 1 },
  { nome_completo: "B", telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, funcao_cargo: null, extra_fields: { "Frequencia Esc.": "Não" }, page: 1 },
  { nome_completo: "C", telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, funcao_cargo: null, extra_fields: { "Frequenda Esc.": "Sim" }, page: 1 },
];
const mv = mergeExtraColumns(variantes);
check("'Frequência Esc.' e 'Frequencia Esc.' viram UMA coluna", mv.labels.filter(l => /Frequ.ncia Esc/i.test(l)).length === 1, JSON.stringify(mv.labels));
check("Rótulo mantém o acento ('Frequência')", mv.labels.some(l => l.includes("ê")), JSON.stringify(mv.labels));
check("'Frequenda' (typo) fica SEPARADO (seguro)", mv.labels.some(l => /Frequenda/i.test(l)), JSON.stringify(mv.labels));
check("Total: 2 colunas (Frequência + Frequenda), não 3", mv.labels.length === 2, JSON.stringify(mv.labels));
check("valueOf casa A e B na mesma coluna", mv.valueOf(variantes[0], mv.keys[0]) === "Sim" && mv.valueOf(variantes[1], mv.keys[0]) === "Não");

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
