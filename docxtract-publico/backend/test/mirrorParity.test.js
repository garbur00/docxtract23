// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  extractPeopleFromNumberedFields as bePivot,
  generateExcel,
} from "../src/services/excelService.js";
import {
  pivotNumberedFieldsToPeople as fePivot,
  clientBuildPeopleTable,
} from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9, page: 1 });


const norm = (p) => ({
  nome: p.nome_completo ?? null,
  tel: p.telefone ?? null,
  cidade: p.cidade ?? null,
  nasc: p.data_nascimento ?? null,
  email: p.email_ou_instagram ?? null,
  cargo: p.funcao_cargo ?? null,
  extra: p.extra_fields ?? {},
  page: p.page ?? 1,
});
const peopleEqual = (a, b) => JSON.stringify(a.map(norm)) === JSON.stringify(b.map(norm));


const scenarios = {
  "2 pessoas básicas": [
    f("Nome completo (1)", "PESSOA FICTICIA 007"), f("Telefone (1)", "11900000010"), f("Cidade (1)", "CIDADE FICTICIA 001"),
    f("Nome completo (2)", "PESSOA FICTICIA 008"), f("Telefone (2)", "(11) 90000-0006"),
  ],
  "alias Paciente + extras": [
    f("Paciente (1)", "PESSOA FICTICIA 001"), f("Pai (1)", "PESSOA FICTICIA 009"), f("Mãe (1)", "PESSOA FICTICIA 010"), f("CPF (1)", "90000000418"),
    f("Paciente (2)", "PESSOA FICTICIA 003"), f("Pai (2)", "PESSOA FICTICIA 011"),
  ],
  "alias Cônjuge/Noivo/Noiva": [
    f("Nome Cônjuge (1)", "PESSOA FICTICIA 012"), f("Noiva (2)", "PESSOA FICTICIA 013"),
  ],
  "Nome da Mãe NÃO é nome": [
    f("Nome (1)", "PESSOA FICTICIA 014"), f("Nome da Mãe (1)", "PESSOA FICTICIA 015"), f("Nome do Pai (1)", "PESSOA FICTICIA 016"),
  ],
  "selo/carimbo excluídos": [
    f("Nome (1)", "PESSOA FICTICIA 017"), f("Cartório Selo (1)", "CARTORIO X"), f("Número Selo (2)", "BPESSOA FICTICIA 03523"),
  ],
  "datas variadas (normalização)": [
    f("Nome (1)", "A"), f("Data de nascimento (1)", "03.03.02"),
    f("Nome (2)", "B"), f("Data de nascimento (2)", "7/6/2004"),
    f("Nome (3)", "C"), f("Data de nascimento (3)", "2001-03-04"),
  ],
  "telefones variados (normalização)": [
    f("Nome (1)", "A"), f("Telefone (1)", "5511900000010"),
    f("Nome (2)", "B"), f("Telefone (2)", "1130000013"),
    f("Nome (3)", "C"), f("Telefone (3)", "11 90000 0010"),
  ],
  "colapso de lista longa": (() => {
    const arr = [f("Nome (1)", "X"), f("Nome (2)", "Y")];
    for (let i = 1; i <= 8; i++) arr.push(f(`Alteração ${i} (1)`, `ev${i}`));
    return arr;
  })(),
  "lista curta NÃO colapsa": [
    f("Nome (1)", "X"), f("Filho 1 (1)", "A"), f("Filho 2 (1)", "B"), f("Filho 3 (1)", "C"),
  ],
};

console.log("═══ Pivot: backend vs frontend (pessoa a pessoa) ═══");
for (const [nome, fields] of Object.entries(scenarios)) {
  const be = bePivot(fields);
  const fe = fePivot(fields);
  const eq = peopleEqual(be, fe);
  check(`"${nome}" → pivots idênticos`, eq,
    eq ? "" : `\n  BE=${JSON.stringify(be.map(norm))}\n  FE=${JSON.stringify(fe.map(norm))}`);
}

console.log("\n═══ Colunas: Excel (backend) vs clientBuildPeopleTable (frontend) ═══");
for (const [nome, fields] of Object.entries(scenarios)) {
  const be = bePivot(fields);
  
  const wb = XLSX.read(generateExcel(
    { document_name: "x", fields, people: [], tables: [], warnings: [], rows: [], headers: [] },
    { clientMode: true }
  ).buffer, { type: "buffer" });
  const excelHead = wb.Sheets["Pessoas"]
    ? XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 })[0]
    : null;
  
  const previewHead = clientBuildPeopleTable(be, fields).headers;
  const eq = JSON.stringify(excelHead) === JSON.stringify(previewHead);
  check(`"${nome}" → colunas idênticas`, eq,
    eq ? "" : `\n  Excel=${JSON.stringify(excelHead)}\n  Prev=${JSON.stringify(previewHead)}`);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
