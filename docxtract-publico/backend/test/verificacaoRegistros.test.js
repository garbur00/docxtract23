// Cenários e dados inteiramente sintéticos para testes automatizados.
import {
  countRecordsIn,
  hasLopsidedRecord,
  computeSymmetricGaps,
  markSymmetricGaps,
} from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9, page: 1 });

console.log("═══ countRecordsIn ═══");
check("2 registros numerados", countRecordsIn({ fields: [f("Nome (1)", "A"), f("Nome (2)", "B")], people: [] }) === 2);
check("página sem numeração mas com campos = 1", countRecordsIn({ fields: [f("Nome", "A"), f("CPF", "1")], people: [] }) === 1);
check("página vazia = 0", countRecordsIn({ fields: [], people: [] }) === 0);
check("people[] explícito conta", countRecordsIn({ fields: [], people: [{ nome_completo: "X" }, { nome_completo: "Y" }] }) === 2);

console.log("\n═══ hasLopsidedRecord (leitura rasa) ═══");
const mk = (n1, n2) => {
  const arr = [];
  for (let i = 0; i < n1; i++) arr.push(f(`Campo${i} (1)`, "v"));
  for (let i = 0; i < n2; i++) arr.push(f(`Campo${i} (2)`, "v"));
  return arr;
};
check("caso real [28,10] → desproporcional", hasLopsidedRecord(mk(28, 10)));
check("caso real [38,5] → desproporcional", hasLopsidedRecord(mk(38, 5)));
check("[28,17] equilibrado → não", !hasLopsidedRecord(mk(28, 17)));
check("[3,1] pequeno (máx < 8) → não dispara", !hasLopsidedRecord(mk(3, 1)));
check("registro único → não", !hasLopsidedRecord(mk(30, 0)));
check("campos vazios não contam", !hasLopsidedRecord([
  ...mk(10, 9), ...Array.from({ length: 20 }, (_, i) => f(`Vazio${i} (2)`, "")),
]));

console.log("\n═══ computeSymmetricGaps (priorização) ═══");


const syntheticCase = [
  f("Paciente (1)", "PESSOA FICTICIA 001"), f("Paciente (2)", "PESSOA FICTICIA 003"),
  f("CPF (1)", "90000000418"),
  f("Número SUS (1)", "90000000000006"),
  f("Naturalidade (1)", "CIDADE FICTICIA 005"),
  f("Telefone pessoa ficticia (1)", "11900000014"),
  f("Escolaridade (1)", "Sem Informação"),
  f("Alteração 3 (1)", "evento"),           
  f("Cartório Selo (1)", "X"),              
  f("Naturalidade (2)", "CIDADE FICTICIA 002"),
];
const gaps = computeSymmetricGaps(syntheticCase);
const names = gaps.map(g => g.name);
check("CPF (2) é lacuna", names.includes("CPF (2)"), JSON.stringify(names));
check("Número SUS (2) é lacuna", names.includes("Número SUS (2)"));
check("itens de lista fora ('Alteração 3 (2)' não)", !names.includes("Alteração 3 (2)"));
check("selo fora", !names.some(n => /Selo/i.test(n)));
check("PRIORIZAÇÃO: identificadores numéricos vêm antes dos rótulos textuais",
  names.indexOf("CPF (2)") < names.indexOf("Escolaridade (2)") &&
  names.indexOf("Número SUS (2)") < names.indexOf("Escolaridade (2)"),
  JSON.stringify(names));
check("titular anexado à lacuna", gaps.find(g => g.name === "CPF (2)")?.titular === "PESSOA FICTICIA 003", JSON.stringify(gaps[0]));
check("registro único → sem lacunas", computeSymmetricGaps([f("Nome (1)", "A"), f("CPF (1)", "1")]).length === 0);
check("cap respeitado", computeSymmetricGaps(
  Array.from({ length: 60 }, (_, i) => f(`Base${String.fromCharCode(65 + (i % 26))}x (${(i % 2) + 1})`, i % 2 ? "" : "v")), 20
).length <= 20);

console.log("\n═══ markSymmetricGaps (lacuna → revisão HUMPESSOA FICTICIA 034, nunca IA) ═══");


const flds = [
  f("Paciente (1)", "PESSOA FICTICIA 001"), f("Paciente (2)", "PESSOA FICTICIA 003"),
  f("CPF (1)", "90000000418"),
];
const n = markSymmetricGaps(flds);
const gap = flds.find(x => x.name === "CPF (2)");
check("retorna nº de lacunas marcadas", n === 1, String(n));
check("campo 'CPF (2)' criado VAZIO", !!gap && gap.value === "");
check("needs_review + _symmetric_gap setados", !!gap && gap.needs_review === true && gap._symmetric_gap === true);
check("aviso cita o titular", !!gap && gap.warnings?.[0]?.includes("PESSOA FICTICIA 003"), JSON.stringify(gap?.warnings));
check("campos com valor intactos", flds.find(x => x.name === "CPF (1)")?.value === "90000000418" && !flds.find(x => x.name === "CPF (1)")?._symmetric_gap);


const flds2 = [
  f("Nome (1)", "A"), f("Nome (2)", "B"),
  f("RG (1)", "900001"), f("RG (2)", ""),
];
markSymmetricGaps(flds2);
const rg2 = flds2.filter(x => x.name === "RG (2)");
check("campo vazio existente é flagado sem duplicar", rg2.length === 1 && rg2[0]._symmetric_gap === true && rg2[0].needs_review === true);


const n2 = markSymmetricGaps(flds2);
check("2ª chamada marca 0 e mantém 1 aviso", n2 === 0 && rg2[0].warnings.length === 1, `n2=${n2} avisos=${rg2[0].warnings.length}`);
const n3 = markSymmetricGaps(flds);
check("2ª chamada também idempotente p/ campo criado", n3 === 0 && flds.filter(x => x.name === "CPF (2)").length === 1, `n3=${n3}`);

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
