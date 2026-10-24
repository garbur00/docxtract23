// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { consolidateDocument } from "../src/services/consolidationService.js";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9 });


const averbacao = [
  f("Título do Documento", "AVERBAÇÃO"),
  f("Tipo de Mandado", "Mandado de Averbação"),
  f("Nome Juíza de Direito", "Ficticioaaa Ficticioaab Ficticioaac"),
  f("Cargo Juíza de Direito", "MMª Juíza de Direito"),
  f("Cidade Comarca", "Ficticioaad"),
  f("Estado Comarca", "Ficticioaae"),
  f("Data Mandado", "19 de outubro de 2006"),
  f("Tipo de Autos", "Divórcio Consensual"),
  f("Número Processo", "667/5339"),
  f("Nome (1)", "FICTICIOAAF FICTICIOAAG FICTICIOAAH"),
  f("Nome (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Data Sentença Divórcio", "02/10/2006"),
  f("Data Trânsito em Julgado", "25/10/2006"),
  f("Nome Solteira Requerente (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Declaração Final", "O referido é verdade e dou fé."),
  f("Local Emissão", "Ficticioaad"),
  f("Data Emissão", "13 de novembro de 2006"),
  f("Nome Assinatura", "Ficticioaak S. Ficticioaal"),
  f("Cartório Selo (1)", "FICTICIOAAM FICTICIOAAN FICTICIOAAO E FICTICIOAAP"),
  f("Tipo Documento Selo (1)", "TÍTULO DOCUMENTOS"),
  f("Comarca Selo (1)", "FICTICIOAAD, FICTICIOAAQ"),
  f("Nome Selo (2)", "FICTICIOAAR"),
  f("Comarca Selo (2)", "FICTICIOAAD"),
  f("Tipo Registro Selo (2)", "FICTICIOAAN FICTICIOAAO"),
  f("Número Selo (2)", "BP829158"),
];

const excel = generateExcel(consolidateDocument(
  [{ page: 1, fields: averbacao, people: [], tables: [], warnings: [] }],
  { documentName: "averbacao_divorcio" }
), { clientMode: true });
const wb = XLSX.read(excel.buffer, { type: "buffer" });
const p = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
const head = p[0] || [];
const rowFor = (nome) => {
  const r = p.slice(1).find(row => row[0] === nome);
  return r ? Object.fromEntries(head.map((h, i) => [h, r[i]])) : null;
};

console.log("═══ Averbação: 2 pessoas, sem contaminação ═══");
check("Exatamente 2 pessoas", p.length === 3, `obteve ${p.length - 1}`);
const hamilton = rowFor("FICTICIOAAF FICTICIOAAG FICTICIOAAH");
const eunice = rowFor("FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ");
check("Ficticioaaf presente", !!hamilton);
check("Ficticioaai presente", !!eunice);

console.log("\n═══ SELOS não contaminam as pessoas ═══");
for (const col of ["Ficticioaam Selo", "Tipo Documento Selo", "Ficticioaat Selo", "Nome Selo", "Tipo Ficticioaan Selo", "Número Selo"]) {
  check(`Coluna "${col}" AUSENTE de Pessoas`, !head.includes(col), JSON.stringify(head));
}

console.log("\n═══ Cargo de TERCEIRO não vira Função/Cargo de pessoa ═══");
check("Coluna Função/Cargo ausente", !head.includes("Função/Cargo"), JSON.stringify(head));
check("Nenhuma célula com o cargo da juíza",
  !p.flat().some(v => String(v).includes("Juíza de Direito")));

console.log("\n═══ Extra legítimo continua funcionando ═══");
check("Nome de solteira (extra da pessoa 2) preservado",
  eunice?.["Nome Solteira Requerente"] === "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ",
  JSON.stringify(head));

console.log("\n═══ Selos e dados do documento vão para a aba Dados ═══");
const d = wb.Sheets["Dados"] ? XLSX.utils.sheet_to_json(wb.Sheets["Dados"], { header: 1 }) : [];
const dCampos = d.slice(1).map(r => r[0]);
const dValores = d.slice(1).map(r => r[1]);
check("Aba Dados existe", d.length > 1, JSON.stringify(wb.SheetNames));
for (const campo of ["Cartório Selo (1)", "Número Selo (2)", "Cargo Juíza de Direito", "Nome Juíza de Direito", "Número Processo", "Data Sentença Divórcio"]) {
  check(`Dados contém "${campo}"`, dCampos.includes(campo), JSON.stringify(dCampos));
}
check("Valor do selo FICTICIOAAR preservado", dValores.includes("FICTICIOAAR"));
check("Nada se perdeu: 25 campos → pessoas + dados",
  dCampos.length + 3  === 25,
  `Dados tem ${dCampos.length}`);

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
