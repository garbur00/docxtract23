// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel, pivotNumberedFieldsToPeople } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};

const personFields = (pg, i, name) => ([
  { name: `Nome completo (${i})`, value: name, page: pg, confidence: 1 },
  { name: `Telefone com DDD (${i})`, value: `1199${i}000000`, page: pg, confidence: 1 },
]);
const roleField = (pg, i, label, marked) => ({
  name: `${label} (${i})`, value: marked ? "X" : "", visual_evidence: !!marked, page: pg, confidence: 1,
});
const doc = (fields, people = []) => ({ document_name: "x", total_pages: 1, fields, people, tables: [] });
const pessoas = (buf) => {
  const wb = XLSX.read(buf, { type: "buffer" });
  if (!wb.Sheets["Pessoas"]) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1, blankrows: false });
};
const allSheetText = (buf) => {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false }))
    .flat().map(x => String(x ?? "")).join(" | ");
};


console.log("═══ 1: ficha com Liderança Política marcada → Função/Cargo aparece ═══");
{
  const fields = [
    ...personFields(1, 1, "ALEXANDRE FICTICIOABD"),
    roleField(1, 1, "Liderança Política", true),
    roleField(1, 1, "Vereador", false),
  ];
  const r = generateExcel(doc(fields), { clientMode: true });
  const rows = pessoas(r.buffer);
  const header = rows[0];
  const roleCol = header.indexOf("Função/Cargo");
  check("coluna Função/Cargo existe", roleCol !== -1, header.join(","));
  check("valor = Liderança Política", rows[1][roleCol] === "Liderança Política", JSON.stringify(rows[1]));
  check("nome preservado", rows[1][0] === "ALEXANDRE FICTICIOABD");
}


console.log("\n═══ 2: ficha SEM marcação → coluna existe mas vazia ═══");
{
  const fields = [
    ...personFields(1, 1, "VITOR FICTICIOAAT"),
    roleField(1, 1, "Vereador", false),
    roleField(1, 1, "Prefeito", false),
  ];
  const r = generateExcel(doc(fields), { clientMode: true });
  const rows = pessoas(r.buffer);
  const roleCol = rows[0].indexOf("Função/Cargo");
  check("coluna existe (seção presente)", roleCol !== -1, rows[0].join(","));
  check("valor vazio", (rows[1][roleCol] ?? "") === "", JSON.stringify(rows[1]));
}


console.log("\n═══ 3: tabela de materiais → SEM Função/Cargo ═══");
{
  const tableDoc = {
    document_name: "pedido", total_pages: 1, people: [], fields: [],
    tables: [{ title: "Materiais", headers: ["Item", "Material", "Qtd", "Preço"],
      rows: [[{ value: "10" }, { value: "Parafuso" }, { value: "100" }, { value: "5,00" }]] }],
  };
  const r = generateExcel(tableDoc, { clientMode: true });
  check("nenhuma coluna Função/Cargo no arquivo", !allSheetText(r.buffer).includes("Função/Cargo"));
}


console.log("\n═══ 4: documento genérico (campos comuns) → sem Função/Cargo forçado ═══");
{
  const fields = [
    { name: "Razão Social", value: "ACME LTDA", page: 1, confidence: 1 },
    { name: "CNPJ", value: "45.678.901/3334-23", page: 1, confidence: 1 },
  ];
  const r = generateExcel(doc(fields), { clientMode: true });
  check("sem Função/Cargo", !allSheetText(r.buffer).includes("Função/Cargo"));
}


console.log("\n═══ 5: pessoas comuns (sem seção) → Pessoas ok, sem coluna ═══");
{
  const people = [
    { nome_completo: "FICTICIOAAS", telefone: "(44) 23333-3333", cidade: "FICTICIOABE", data_nascimento: "08/01/1990", email_ou_instagram: null, page: 1 },
    { nome_completo: "FICTICIOACR", telefone: "(44) 23333-3334", cidade: "FICTICIOABE", data_nascimento: "09/02/1991", email_ou_instagram: null, page: 1 },
  ];
  const r = generateExcel(doc([], people), { clientMode: true });
  const rows = pessoas(r.buffer);
  check("2 pessoas", rows.length - 1 === 2, `${rows.length - 1}`);
  check("sem coluna Função/Cargo", rows[0].indexOf("Função/Cargo") === -1, rows[0].join(","));
}


console.log("\n═══ 6: várias pessoas, cargos distintos por índice ═══");
{
  const fields = [
    ...personFields(1, 1, "P1"), roleField(1, 1, "Pré-Cand. a Vereador", true),
    ...personFields(1, 2, "P2"), roleField(1, 2, "Secretário Municipal", true),
    ...personFields(1, 3, "P3"), roleField(1, 3, "Liderança Política", false), 
  ];
  const r = generateExcel(doc(fields), { clientMode: true });
  const rows = pessoas(r.buffer);
  const c = rows[0].indexOf("Função/Cargo");
  const byName = Object.fromEntries(rows.slice(1).map(x => [x[0], x[c]]));
  check("P1 = Pré-Cand. a Vereador", byName.P1 === "Pré-Cand. a Vereador", byName.P1);
  check("P2 = Secretário Municipal", byName.P2 === "Secretário Municipal", byName.P2);
  check("P3 vazio (não marcado)", (byName.P3 ?? "") === "", byName.P3);
}


console.log("\n═══ 7: 'Pré-Cand. a Vereador' não vira só 'Vereador' (ordem) ═══");
{
  const ppl = pivotNumberedFieldsToPeople([
    { name: "Nome completo (1)", value: "X", page: 1 },
    { name: "Pré-Cand. a Vereador (1)", value: "X", visual_evidence: true, page: 1 },
  ]);
  check("rótulo correto", ppl[0].funcao_cargo === "Pré-Cand. a Vereador", ppl[0].funcao_cargo);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
