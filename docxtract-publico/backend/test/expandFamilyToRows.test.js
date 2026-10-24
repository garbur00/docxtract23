// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";
import { expandFamilyToRows, clientBuildPeopleTable } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};

const person = (nome, cidade, extra, page = 1) => ({
  nome_completo: nome, telefone: "(44) 23333-3333", cidade, data_nascimento: "08/01/1980",
  email_ou_instagram: null, funcao_cargo: null, extra_fields: extra, confidence: 0.9, page,
});


const patients = [
  person("BEL INACIO DOS SANTOS", "FICTICIOAAX FICTICIOAAY", { "Mãe": "FICTICIOABG FICTICIOAAV DA FICTICIOABH", "CPF": "91455493112", "Número SUS": "03383563408248" }),
  person("ABELO FERNANDES NERIS", "FICTICIOAAX FICTICIOAAY", { "Mãe": "FICTICIOABI FICTICIOABJ DE FICTICIOAAW", "CPF": "46442385116" }),
  person("ABILIO DA FICTICIOABD FICTICIOABL", "FICTICIOAAX FICTICIOAAY", { "Mãe": "FICTICIOABK DA FICTICIOABD FICTICIOABL", "Pai": "FICTICIOABM FICTICIOAAC DE FICTICIOABN", "CPF": "68701313843" }),
];

const expanded = expandFamilyToRows(patients);

console.log("═══ Expansão: 3 pacientes → linhas de titular + familiares ═══");
check("Titulares preservados (3)", ["BEL INACIO DOS SANTOS", "ABELO FERNANDES NERIS", "ABILIO DA FICTICIOABD FICTICIOABL"]
  .every(n => expanded.some(p => p.nome_completo === n)));
check("Mães viraram linhas (FICTICIOABG, FICTICIOABI, FICTICIOABK)", ["FICTICIOABG FICTICIOAAV DA FICTICIOABH", "FICTICIOABI FICTICIOABJ DE FICTICIOAAW", "FICTICIOABK DA FICTICIOABD FICTICIOABL"]
  .every(n => expanded.some(p => p.nome_completo === n)));
check("Pai (FICTICIOABM) também virou linha", expanded.some(p => p.nome_completo === "FICTICIOABM FICTICIOAAC DE FICTICIOABN"));
check("Total = 3 titulares + 4 familiares = 7 linhas", expanded.length === 7, `obteve ${expanded.length}`);

console.log("\n═══ Sem roubo de identificadores ═══");
const elvira = expanded.find(p => p.nome_completo === "FICTICIOABG FICTICIOAAV DA FICTICIOABH");
check("Linha da FICTICIOABG NÃO tem CPF do BEL", !JSON.stringify(elvira.extra_fields).includes("91455493112"));
check("Linha da FICTICIOABG NÃO tem SUS do BEL", !JSON.stringify(elvira.extra_fields).includes("03383563408248"));
check("Linha da FICTICIOABG sem telefone do titular", elvira.telefone == null);
check("FICTICIOABG leva a cidade compartilhada", elvira.cidade === "FICTICIOAAX FICTICIOAAY");
check("FICTICIOABG marcada com relação ao titular", elvira.extra_fields["Relação"] === "Mãe de BEL INACIO DOS SANTOS", JSON.stringify(elvira.extra_fields));
check("Flag _derived_family", elvira._derived_family === true);
const bel = expanded.find(p => p.nome_completo === "BEL INACIO DOS SANTOS");
check("Titular BEL mantém seu CPF", bel.extra_fields["CPF"] === "91455493112");

console.log("\n═══ Não duplica nome já listado ═══");
const withDup = expandFamilyToRows([
  person("FICTICIOAAV FICTICIOABD", "FICTICIOABE", { "Mãe": "FICTICIOABO FICTICIOABD" }),
  person("FICTICIOABO FICTICIOABD", "FICTICIOABE", {}),   
]);
check("FICTICIOABO aparece uma vez só (não duplica)", withDup.filter(p => p.nome_completo === "FICTICIOABO FICTICIOABD").length === 1, `${withDup.length} linhas`);

console.log("\n═══ Idempotente e sem efeito quando não há familiares ═══");
const noFamily = [person("SOZINHO", "FICTICIOABE", { "CPF": "111" })];
check("Sem familiares → inalterado", expandFamilyToRows(noFamily).length === 1);

console.log("\n═══ Excel final: 7 linhas, coluna Relação, CPF só nos titulares ═══");
const wb = XLSX.read(generateExcel(
  { document_name: "jojo6", fields: [], people: expanded, tables: [], warnings: [], rows: [], headers: [] },
  { clientMode: true }
).buffer, { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
check("Excel tem 7 linhas de pessoa", aoa.length - 1 === 7, `${aoa.length - 1}`);
check("Coluna Relação existe", aoa[0].includes("Relação"));
const cpfCol = aoa[0].indexOf("CPF");
const elviraRow = aoa.find(r => r[0] === "FICTICIOABG FICTICIOAAV DA FICTICIOABH");
check("FICTICIOABG sem CPF no Excel", cpfCol < 0 || !elviraRow[cpfCol], `cpf="${cpfCol >= 0 ? elviraRow[cpfCol] : "-"}"`);
const belRow = aoa.find(r => r[0] === "BEL INACIO DOS SANTOS");
check("BEL com CPF no Excel", cpfCol >= 0 && belRow[cpfCol] === "91455493112");

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
