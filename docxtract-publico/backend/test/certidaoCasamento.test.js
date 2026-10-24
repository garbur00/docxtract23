// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { consolidateDocument } from "../src/services/consolidationService.js";
import { generateExcel, extractPeopleFromNumberedFields } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.9 });

const certidao = [
  
  f("Cartório", "Ficticioaan Ficticioaao — Ficticioaas e Ficticioaat de Ficticioaad - FICTICIOAAQ"),
  f("Casamento nº", "4.099"),
  f("Livro", "10-B"),
  f("Data do casamento", "02/07/2004"),
  f("Regime de bens", "Comunhão Parcial de Bens"),
  f("Data de emissão", "20/11/2006"),
  
  f("Nome (1)", "FICTICIOAAF FICTICIOAAG FICTICIOAAH"),
  f("Data de nascimento (1)", "15/11/1945"),
  f("Naturalidade (1)", "Ficticioaau Ficticioaav da Ficticioaaw"),
  f("Profissão (1)", "vendedor"),
  f("Endereço (1)", "Ficticioaax Ficticioaay Ficticioaaz, ficticioaaa 29"),
  f("Pai (1)", "FICTICIOAAB FICTICIOAAG FICTICIOAAH"),
  f("Mãe (1)", "FICTICIOAAC FICTICIOAAD DO FICTICIOAAE FICTICIOAAH"),
  
  f("Nome (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Data de nascimento (2)", "23/11/1962"),
  f("Naturalidade (2)", "Ficticioaad"),
  f("Profissão (2)", "professora"),
  f("Endereço (2)", "Ficticioaax Ficticioaay Ficticioaaz, ficticioaaa 29"),
  f("Pai (2)", "FICTICIOAAF FICTICIOAAG DE FICTICIOAAJ"),
  f("Mãe (2)", "FICTICIOAAG FICTICIOAAH DE FICTICIOAAJ"),
  
  f("Testemunha 1", "GUALTER FICTICIOAAG DE FICTICIOAAJ"),
  f("Testemunha 2", "FICTICIOAAV AMÉLIA DE FICTICIOAAJ TEIXEIRA"),
];

const consolidated = consolidateDocument(
  [{ page: 1, fields: certidao, people: [], tables: [], warnings: [] }],
  { documentName: "certidao_casamento" }
);
const excel = generateExcel(consolidated, { clientMode: true });
const wb = XLSX.read(excel.buffer, { type: "buffer" });
const sheet = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
const head = sheet[0] || [];
const rowFor = (nome) => {
  const r = sheet.slice(1).find(row => row[0] === nome);
  return r ? Object.fromEntries(head.map((h, i) => [h, r[i]])) : null;
};

console.log("═══ Certidão de casamento: 2 pessoas + cabeçalho ═══");
check("Exatamente 2 pessoas", sheet.length === 3, `obteve ${sheet.length - 1} linha(s)`);

const noivo = rowFor("FICTICIOAAF FICTICIOAAG FICTICIOAAH");
const noiva = rowFor("FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ");
check("Noivo presente", !!noivo);
check("Noiva presente", !!noiva);

console.log("\n═══ Cabeçalho NÃO vaza para a aba Pessoas ═══");
for (const col of ["Cartório", "Casamento nº", "Livro", "Regime de bens", "Data do casamento", "Data de emissão"]) {
  check(`Coluna de cabeçalho "${col}" ausente`, !head.includes(col));
}

console.log("\n═══ Dados por pessoa ═══");
check("Noivo · nascimento 15/11/1945", noivo?.["Data de nascimento"] === "15/11/1945", `obteve "${noivo?.["Data de nascimento"]}"`);
check("Noiva · nascimento 23/11/1962", noiva?.["Data de nascimento"] === "23/11/1962", `obteve "${noiva?.["Data de nascimento"]}"`);
check("Noivo · Pai", noivo?.["Pai"] === "FICTICIOAAB FICTICIOAAG FICTICIOAAH");
check("Noivo · Mãe", noivo?.["Mãe"] === "FICTICIOAAC FICTICIOAAD DO FICTICIOAAE FICTICIOAAH");
check("Noiva · Pai", noiva?.["Pai"] === "FICTICIOAAF FICTICIOAAG DE FICTICIOAAJ");
check("Noiva · Mãe", noiva?.["Mãe"] === "FICTICIOAAG FICTICIOAAH DE FICTICIOAAJ");
check("Profissões corretas", noivo?.["Profissão"] === "vendedor" && noiva?.["Profissão"] === "professora",
  `obteve "${noivo?.["Profissão"]}" / "${noiva?.["Profissão"]}"`);
check("Naturalidades corretas",
  noivo?.["Naturalidade"] === "Ficticioaau Ficticioaav da Ficticioaaw" && noiva?.["Naturalidade"] === "Ficticioaad");
check("Endereço com dígitos no VALOR intacto (ficticioaaa 29)",
  noivo?.["Endereço"] === "Ficticioaax Ficticioaay Ficticioaaz, ficticioaaa 29" && noiva?.["Endereço"] === "Ficticioaax Ficticioaay Ficticioaaz, ficticioaaa 29");

console.log("\n═══ Convenção: nome de campo terminado em dígito ═══");
check("Coluna Testemunha existe", head.includes("Testemunha"));
check("Testemunha 1 → linha do noivo", noivo?.["Testemunha"] === "GUALTER FICTICIOAAG DE FICTICIOAAJ", `obteve "${noivo?.["Testemunha"]}"`);
check("Testemunha 2 → linha da noiva", noiva?.["Testemunha"] === "FICTICIOAAV AMÉLIA DE FICTICIOAAJ TEIXEIRA", `obteve "${noiva?.["Testemunha"]}"`);

console.log("\n═══ Aliases REAIS de nome (observados em run ficticioaap com Gemini) ═══");


const aliasConjuge = extractPeopleFromNumberedFields([
  f("Nome Cônjuge (1)", "FICTICIOAAF FICTICIOAAG FICTICIOAAH"),
  f("Filiação Pai (1)", "FICTICIOAAB FICTICIOAAG FICTICIOAAH"),
  f("Nome Cônjuge (2)", "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ"),
  f("Filiação Pai (2)", "FICTICIOAAF FICTICIOAAG DE FICTICIOAAJ"),
].map(x => ({ ...x, page: 1 })));
check("'Nome Cônjuge (N)' vira nome da pessoa (2 pessoas)",
  aliasConjuge.length === 2 &&
  aliasConjuge[0]?.nome_completo === "FICTICIOAAF FICTICIOAAG FICTICIOAAH" &&
  aliasConjuge[1]?.nome_completo === "FICTICIOAAI FICTICIOAAB DE FICTICIOAAJ",
  JSON.stringify(aliasConjuge.map(p => p.nome_completo)));
check("Filiação vira extra, não nome", aliasConjuge[0]?.extra_fields?.["Filiação Pai"] === "FICTICIOAAB FICTICIOAAG FICTICIOAAH");

const aliasVariantes = extractPeopleFromNumberedFields([
  f("Noivo (1)", "PESSOA A"),
  f("Noiva (2)", "PESSOA B"),
  f("Cônjuge (3)", "PESSOA C"),
].map(x => ({ ...x, page: 1 })));
check("Variantes Noivo/Noiva/Cônjuge também viram nome",
  aliasVariantes.length === 3 && aliasVariantes.every(p => p.nome_completo?.startsWith("PESSOA")),
  JSON.stringify(aliasVariantes.map(p => p.nome_completo)));




const aliasPaciente = extractPeopleFromNumberedFields([
  f("Paciente (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("CPF (1)", "27781584139"),
  f("Paciente (2)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Nome do Paciente (3)", "PESSOA FICTICIOAAO"),
].map(x => ({ ...x, page: 1 })));
check("'Paciente (N)' e 'Nome do Paciente (N)' viram nome da pessoa",
  aliasPaciente.length === 3 &&
  aliasPaciente[0]?.nome_completo === "FICTICIOAAI FICTICIOAAJ FICTICIOAAK" &&
  aliasPaciente[1]?.nome_completo === "FICTICIOAAL FICTICIOAAM FICTICIOAAN" &&
  aliasPaciente[2]?.nome_completo === "PESSOA FICTICIOAAO",
  JSON.stringify(aliasPaciente.map(p => p.nome_completo)));
check("CPF continua extra na pessoa 1", aliasPaciente[0]?.extra_fields?.["CPF"] === "27781584139");

const naoNome = extractPeopleFromNumberedFields([
  f("Nome (1)", "PESSOA FICTICIOAAP"),
  f("Nome da Mãe (1)", "MÃE DA PESSOA"),
  f("Nome do Pai (1)", "PAI DA PESSOA"),
].map(x => ({ ...x, page: 1 })));
check("'Nome da Mãe (1)' NÃO vira nome da pessoa",
  naoNome.length === 1 && naoNome[0]?.nome_completo === "PESSOA FICTICIOAAP",
  JSON.stringify(naoNome.map(p => p.nome_completo)));
check("'Nome da Mãe'/'Nome do Pai' viram extras",
  naoNome[0]?.extra_fields?.["Nome da Mãe"] === "MÃE DA PESSOA" &&
  naoNome[0]?.extra_fields?.["Nome do Pai"] === "PAI DA PESSOA");

console.log("\n═══ FIX Preview→Excel: aba Dados com campos não-pessoa ═══");



const dados = wb.Sheets["Dados"] ? XLSX.utils.sheet_to_json(wb.Sheets["Dados"], { header: 1 }) : null;
check("Aba Dados existe ao lado de Pessoas", !!dados && wb.SheetNames[0] === "Pessoas",
  `abas: ${JSON.stringify(wb.SheetNames)}`);
const dadosCampos = (dados || []).slice(1).map(r => r[0]);


for (const campo of ["Cartório", "Regime de bens", "Casamento nº", "Livro", "Data do casamento", "Data de emissão"]) {
  check(`Dados contém "${campo}"`, dadosCampos.includes(campo), JSON.stringify(dadosCampos));
}
check("Dados NÃO duplica campos de pessoa", !dadosCampos.some(c => /\(\d+\)\s*$/.test(String(c))),
  JSON.stringify(dadosCampos.filter(c => /\(\d+\)\s*$/.test(String(c)))));



const comTabela = generateExcel(consolidateDocument(
  [{
    page: 1,
    fields: [f("Paciente (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK")],
    people: [],
    tables: [{ headers: ["Alterado em", "Por"], rows: [["64/31/5356 46:52", "kldsantos"], ["38/31/5357 30:38", "dbinal"]] }],
    warnings: [],
  }],
  { documentName: "ficha_com_alteracoes" }
), { clientMode: true });
const wbTab = XLSX.read(comTabela.buffer, { type: "buffer" });
check("Pessoas + tabela → aba de tabela presente ao lado de Pessoas",
  wbTab.SheetNames[0] === "Pessoas" && wbTab.SheetNames.some(n => n === "Tabela" || n === "Itens"),
  JSON.stringify(wbTab.SheetNames));
const abaTab = XLSX.utils.sheet_to_json(wbTab.Sheets[wbTab.SheetNames.find(n => n === "Tabela" || n === "Itens")] || {}, { header: 1 });
check("Tabela preserva as linhas de Alterações",
  JSON.stringify(abaTab.flat()).includes("kldsantos") && JSON.stringify(abaTab.flat()).includes("dbinal"),
  JSON.stringify(abaTab));


const soPessoas = generateExcel(consolidateDocument(
  [{ page: 1, fields: [f("Nome (1)", "PESSOA A"), f("Telefone (1)", "(44) 21111-0000")], people: [], tables: [], warnings: [] }],
  { documentName: "so_pessoas" }
), { clientMode: true });
const wbSo = XLSX.read(soPessoas.buffer, { type: "buffer" });
check("Sem campos de documento → só aba Pessoas (layout antigo)",
  JSON.stringify(wbSo.SheetNames) === JSON.stringify(["Pessoas"]), JSON.stringify(wbSo.SheetNames));

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
