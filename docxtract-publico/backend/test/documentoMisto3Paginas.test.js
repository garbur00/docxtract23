// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { consolidateDocument } from "../src/services/consolidationService.js";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9 });


const pag1 = [
  f("Título do Documento", "Prefeitura Municipal de Várzea Ficticioaay"),
  f("Data e Hora do Relatório", "54-30-5359 47:02:49"),
  f("Unidade (1)", "0002 - USF FICTICIOACH FICTICIOACL"),
  f("Paciente (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Pai (1)", "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK"),
  f("Mãe (1)", "FICTICIOAAU FICTICIOAAV DE FICTICIOAAW"),
  f("Telefone (1)", "(44) 201621865"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),
  f("Nascimento (1)", "17-11-1946"),
  f("CPF (1)", "27781584139"),
  f("Número SUS (1)", "03713587473617"),
  ...Array.from({ length: 11 }, (_, i) => f(`Alteração ${i + 1} (1)`, `Alterado em: evento ${i + 1}`)),
  f("Paciente (2)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Pai (2)", "FICTICIOAAL FICTICIOAAR"),
  f("Mãe (2)", "FICTICIOAAZ FICTICIOABA"),
  f("Telefone (2)", "(44) 209935170"),
  f("Cidade (2)", "FICTICIOAAX FICTICIOAAY"),
  f("Nascimento (2)", "17-10-1994"),
  f("CPF (2)", "57469296115"),
];


const pag2 = [
  f("Número do Casamento", "4.099"),
  f("Data do Assento", "12/06/2004"),
  f("Nome (1)", "FICTICIOAAF FICTICIOAAG FICTICIOAAH"),
  f("Filiação Pai (1)", "FICTICIOAAB FICTICIOAAG FICTICIOAAH"),
  f("Data de Nascimento (1)", "15/11/1945"),
  f("Profissão (1)", "vendedor"),
  f("Nome (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Filiação Pai (2)", "FICTICIOAAF FICTICIOAAG DE FICTICIOAAJ"),
  f("Data de Nascimento (2)", "23/11/1962"),
  f("Profissão (2)", "professora"),
  f("Testemunha (1) Nome", "Ficticioabb Ficticioabc da Ficticioabd"),
  f("Regime de Bens", "Comunhão Parcial de Bens"),
];


const pag3 = [
  f("Nome Juíza de Direito", "Ficticioaaa Ficticioaab Ficticioaac"),
  f("Cargo Juíza de Direito", "MMª Juíza de Direito"),
  f("Número Processo", "667/5339"),
  f("Nome (1)", "FICTICIOAAF FICTICIOAAG FICTICIOAAH"),
  f("Nome (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Nome Solteira Requerente (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Cartório Selo (1)", "FICTICIOAAM FICTICIOAAN FICTICIOAAO E FICTICIOAAP"),
  f("Número Selo (2)", "BP829158"),
];

const excel = generateExcel(consolidateDocument([
  { page: 1, fields: pag1, people: [], tables: [], warnings: [] },
  { page: 2, fields: pag2, people: [], tables: [], warnings: [] },
  { page: 3, fields: pag3, people: [], tables: [], warnings: [] },
], { documentName: "documento_misto" }), { clientMode: true });

const wb = XLSX.read(excel.buffer, { type: "buffer" });
const p = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
const head = p[0] || [];
const rows = p.slice(1);
const col = (h) => head.indexOf(h);
const rowOf = (nome, page) => rows.find(r => r[0] === nome && r[r.length - 1] === page);

console.log("═══ 6 pessoas, páginas corretas ═══");
check("6 pessoas no total", rows.length === 6, `obteve ${rows.length}`);
check("Pág 1: FICTICIOAAI + FICTICIOAAL", !!rowOf("FICTICIOAAI FICTICIOAAJ FICTICIOAAK", 1) && !!rowOf("FICTICIOAAL FICTICIOAAM FICTICIOAAN", 1));
check("Pág 2: FICTICIOAAF + FICTICIOAAI", !!rowOf("FICTICIOAAF FICTICIOAAG FICTICIOAAH", 2) && !!rowOf("FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ", 2));
check("Pág 3: FICTICIOAAF + FICTICIOAAI (de novo — página distinta)", !!rowOf("FICTICIOAAF FICTICIOAAG FICTICIOAAH", 3) && !!rowOf("FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ", 3));

console.log("\n═══ Sem vazamento entre páginas ═══");
const abdias = rowOf("FICTICIOAAI FICTICIOAAJ FICTICIOAAK", 1);
const hamilton2 = rowOf("FICTICIOAAF FICTICIOAAG FICTICIOAAH", 2);
check("CPF do FICTICIOAAI não vaza para FICTICIOAAF", hamilton2[col("CPF")] === "" || hamilton2[col("CPF")] == null);
check("Filiação Pai do FICTICIOAAF não vaza para FICTICIOAAI", col("Filiação Pai") < 0 || abdias[col("Filiação Pai")] === "");
check("Profissão só nas linhas da certidão",
  hamilton2[col("Profissão")] === "vendedor" && (abdias[col("Profissão")] === "" || abdias[col("Profissão")] == null));

console.log("\n═══ Regras aplicadas no documento misto ═══");
check("Colapso: UMA coluna Alteração (não 11)", head.filter(h => /^Alteração/.test(String(h))).length === 1, JSON.stringify(head));
check("11 eventos preservados no join", String(abdias[col("Alteração")]).split(" | ").length === 11);
check("Selos fora de Pessoas", !head.some(h => /Selo/i.test(String(h))));
check("Cargo da juíza fora de Pessoas", !head.includes("Função/Cargo"));
check("E-mail/Instagram ausente (ninguém tem)", !head.includes("E-mail/Instagram"));
check("Telefone presente (fichas têm) e vazio na certidão",
  col("Telefone") >= 0 && abdias[col("Telefone")] === "(44) 20162-1865" && (hamilton2[col("Telefone")] === "" || hamilton2[col("Telefone")] == null));
check("Nome de solteira como extra da FICTICIOAAI pág 3",
  rowOf("FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ", 3)[col("Nome Solteira Requerente")] === "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ");

console.log("\n═══ Aba Dados: campos de documento com a página certa ═══");
const d = wb.Sheets["Dados"] ? XLSX.utils.sheet_to_json(wb.Sheets["Dados"], { header: 1 }).slice(1) : [];
const dado = (campo) => d.find(r => r[0] === campo);
check("Aba Dados existe", d.length > 0, JSON.stringify(wb.SheetNames));
check("'Título do Documento' → Página 1", dado("Título do Documento")?.[2] === 1, JSON.stringify(dado("Título do Documento")));
check("'Regime de Bens' → Página 2", dado("Regime de Bens")?.[2] === 2);
check("'Testemunha (1) Nome' → Página 2 (índice no meio → Dados)", dado("Testemunha (1) Nome")?.[2] === 2);
check("'Cargo Juíza de Direito' → Página 3", dado("Cargo Juíza de Direito")?.[2] === 3);
check("'Ficticioaam Selo (1)' → Página 3", dado("Cartório Selo (1)")?.[2] === 3);

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
