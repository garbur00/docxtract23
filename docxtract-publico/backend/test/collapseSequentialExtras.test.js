// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  collapseSequentialExtras,
  extractPeopleFromNumberedFields,
  generateExcel,
} from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9, page: 1 });

console.log("═══ Unidade: colapso direto ═══");
const many = {};
for (let i = 1; i <= 11; i++) many[`Alteração ${i}`] = `evento ${i}`;
many["Pai"] = "FULANO";
const c1 = collapseSequentialExtras(many);
check("11 'Alteração N' viram 1 coluna 'Alteração'", c1["Alteração"] !== undefined && c1["Alteração 1"] === undefined);
check("Valores juntados na ordem", c1["Alteração"] === Array.from({length:11},(_,i)=>`evento ${i+1}`).join(" | "), c1["Alteração"]);
check("Ordem numérica correta (10/11 depois de 9)", c1["Alteração"].endsWith("evento 10 | evento 11"));
check("Campo não-lista preservado", c1["Pai"] === "FULANO");

console.log("\n═══ Lista pequena (< 5) NÃO colapsa ═══");
const few = { "Filho 1": "A", "Filho 2": "B", "Filho 3": "C", "CPF": "123" };
const c2 = collapseSequentialExtras(few);
check("3 'Filho N' continuam colunas separadas", c2["Filho 1"] === "A" && c2["Filho 3"] === "C" && c2["Filho"] === undefined);

console.log("\n═══ Só valores não-vazios entram no join ═══");
const gaps = {};
for (let i = 1; i <= 6; i++) gaps[`Nota ${i}`] = i % 2 === 0 ? `n${i}` : "";
const c3 = collapseSequentialExtras(gaps);
check("Vazios ignorados no join", c3["Nota"] === "n2 | n4 | n6", c3["Nota"]);

console.log("\n═══ Pipeline ficticioaap: pivot da ficha dupla com 11 Alterações ═══");
const fields = [
  f("Paciente (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"), f("Pai (1)", "FICTICIOAAQ"), f("CPF (1)", "27781584139"),
  f("Paciente (2)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"), f("Pai (2)", "FICTICIOAAL FICTICIOAAR"), f("CPF (2)", "57469296115"),
];
for (let i = 1; i <= 11; i++) fields.push(f(`Alteração ${i} (1)`, `Alterado em: 0${i}/2025 por: user${i}`));
const people = extractPeopleFromNumberedFields(fields);
check("2 pessoas", people.length === 2);
check("Pessoa 1 tem coluna 'Alteração' única", people[0].extra_fields["Alteração"] !== undefined && people[0].extra_fields["Alteração 1"] === undefined);
check("Pessoa 1 preserva os 11 eventos no join", people[0].extra_fields["Alteração"].split(" | ").length === 11);
check("Pessoa 2 não tem coluna Alteração", people[1].extra_fields["Alteração"] === undefined);

const wb = XLSX.read(generateExcel(
  { document_name: "x", fields, people: [], tables: [], warnings: [], rows: [], headers: [] },
  { clientMode: true }
).buffer, { type: "buffer" });
const head = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 })[0];
const altCols = head.filter(h => /^Alteração/.test(String(h)));
check("Excel tem UMA coluna Alteração (não 11)", altCols.length === 1, JSON.stringify(altCols));
check("Colunas totais enxutas (Nome+Pai+CPF+Alteração+Página = 5)", head.length === 5, JSON.stringify(head));

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
