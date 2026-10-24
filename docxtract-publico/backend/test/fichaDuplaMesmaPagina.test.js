// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  extractPeopleFromNumberedFields,
  isEmptyPerson,
  generateExcel,
} from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};




const f = (name, value) => ({ name, value, confidence: 0.92, page: 1 });

const fichaDupla = [
  
  f("Nome (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Data de nascimento (1)", "17-11-1946"),
  f("Mãe (1)", "FICTICIOAAU FICTICIOAAV DE FICTICIOAAW"),
  f("Observação (1)", "NIS: 9172797 CROSS: 53266520"),
  f("Pai (1)", "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK"),
  f("Endereço (1)", "FICTICIOACF FICTICIOACG"),
  f("Número (1)", "231"),
  f("Bairro (1)", "FICTICIOACH FICTICIOACI"),
  f("CEP (1)", "46554513"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),
  f("Estado (1)", "FICTICIOABE"),
  f("Telefone (1)", "(44) 201621165"),
  f("Sexo (1)", "Masculino"),
  f("Raça/Cor (1)", "Parda"),
  f("Escolaridade (1)", "Sem Informação"),
  f("País de Origem (1)", "FICTICIOACO"),
  f("Naturalidade (1)", "FICTICIOACP"),
  f("Estado Natur. (1)", "BA"),
  f("Número SUS (1)", "03713587473617"),
  f("CPF (1)", "27781584139"),
  f("HC (1)", "CONEXA"),
  f("Alterações (1)", "Alterado em: 64/31/5356 46:52 por: ktdsantos; Alterado em: 38/31/5357 30:38 por: dbiral"),
  
  f("Nome (2)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Data de nascimento (2)", "17-10-1994"),
  f("Mãe (2)", "FICTICIOAAZ FICTICIOABA"),
  f("Pai (2)", "FICTICIOAAL FICTICIOAAR"),
  f("Endereço (2)", "FICTICIOACF FICTICIOACJ FICTICIOACK"),
  f("Número (2)", "258"),
  f("Bairro (2)", "FICTICIOACH FICTICIOACL"),
  f("CEP (2)", "46556533"),
  f("Cidade (2)", "FICTICIOAAX FICTICIOAAY"),
  f("Estado (2)", "FICTICIOABE"),
  f("Telefone (2)", "(44) 209935970"),
  f("Sexo (2)", "Masculino"),
  f("Raça/Cor (2)", "Parda"),
  f("País de Origem (2)", "FICTICIOACQ"),
  f("Entrada (2)", "23-05-2018"),
  f("Naturalidade (2)", "FICTICIOAAX FICTICIOAAY"),
  f("Número SUS (2)", "03853878160150"),
  f("CPF (2)", "57469296115"),
];


const extrasEsperados1 = {
  "Mãe": "FICTICIOAAU FICTICIOAAV DE FICTICIOAAW",
  "Pai": "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK",
  "Endereço": "FICTICIOACF FICTICIOACG",
  "Número": "231",
  "Bairro": "FICTICIOACH FICTICIOACI",
  "CEP": "46554513",
  "Estado": "FICTICIOABE",
  "Sexo": "Masculino",
  "Raça/Cor": "Parda",
  "Escolaridade": "Sem Informação",
  "País de Origem": "FICTICIOACO",
  "Naturalidade": "FICTICIOACP",
  "Estado Natur.": "BA",
  "Número SUS": "03713587473617",
  "CPF": "27781584139",
  "HC": "CONEXA",
};
const extrasEsperados2 = {
  "Mãe": "FICTICIOAAZ FICTICIOABA",
  "Pai": "FICTICIOAAL FICTICIOAAR",
  "Endereço": "FICTICIOACF FICTICIOACJ FICTICIOACK",
  "Número": "258",
  "Bairro": "FICTICIOACH FICTICIOACL",
  "CEP": "46556533",
  "País de Origem": "FICTICIOACQ",
  "Entrada": "23-05-2018",
  "Número SUS": "03853878160150",
  "CPF": "57469296115",
};


console.log("═══ 1: pivot preserva as 2 pessoas e TODOS os campos ═══");
const people = extractPeopleFromNumberedFields(fichaDupla);

check("Retornou 2 pessoas", people.length === 2, `obteve ${people.length}`);
const [p1, p2] = people;

check("#1 nome = FICTICIOAAI FICTICIOAAJ FICTICIOAAK", p1?.nome_completo === "FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
check("#1 telefone normalizado = (44) 20162-1165", p1?.telefone === "(44) 20162-1165", `obteve "${p1?.telefone}"`);
check("#1 cidade = FICTICIOAAX FICTICIOAAY", p1?.cidade === "FICTICIOAAX FICTICIOAAY");
check("#1 data = 17/11/1946", p1?.data_nascimento === "17/11/1946", `obteve "${p1?.data_nascimento}"`);
check("#2 nome = FICTICIOAAL FICTICIOAAM FICTICIOAAN", p2?.nome_completo === "FICTICIOAAL FICTICIOAAM FICTICIOAAN");
check("#2 telefone normalizado = (44) 20993-5970", p2?.telefone === "(44) 20993-5970", `obteve "${p2?.telefone}"`);
check("#2 data = 17/10/1994", p2?.data_nascimento === "17/10/1994", `obteve "${p2?.data_nascimento}"`);

for (const [k, v] of Object.entries(extrasEsperados1)) {
  check(`#1 extra "${k}" = "${v}"`, p1?.extra_fields?.[k] === v, `obteve "${p1?.extra_fields?.[k]}"`);
}
for (const [k, v] of Object.entries(extrasEsperados2)) {
  check(`#2 extra "${k}" = "${v}"`, p2?.extra_fields?.[k] === v, `obteve "${p2?.extra_fields?.[k]}"`);
}
check("#1 extra longo (Alterações) preservado sem truncar",
  (p1?.extra_fields?.["Alterações"] || "").includes("ktdsantos") &&
  (p1?.extra_fields?.["Alterações"] || "").includes("dbiral"));


console.log("\n═══ 2: Excel clientMode — caminho backend-pivota (people vazio) ═══");
const consolidatedA = {
  document_name: "ficha_dupla_ficticioacd",
  fields: fichaDupla,
  people: [],
  tables: [],
  warnings: [],
  rows: [],
  headers: [],
  total_pages: 1,
};
const excelA = generateExcel(consolidatedA, { clientMode: true });
const wbA = XLSX.read(excelA.buffer, { type: "buffer" });
const sheetA = XLSX.utils.sheet_to_json(wbA.Sheets["Pessoas"], { header: 1 });
const headA = sheetA[0] || [];

check("Aba Pessoas existe", wbA.SheetNames.includes("Pessoas"));
check("2 linhas de dados", sheetA.length === 3, `obteve ${sheetA.length - 1}`);


check("Colunas clássicas com dados preservadas no início",
  headA[0] === "Nome completo" && headA[1] === "Telefone" && headA[2] === "Cidade" &&
  headA[3] === "Data de nascimento", JSON.stringify(headA.slice(0, 5)));
check("Coluna vazia 'E-mail/Instagram' NÃO é mais escrita (layout adaptativo)",
  !headA.includes("E-mail/Instagram"));
check("Última coluna = Página", headA[headA.length - 1] === "Página");

for (const col of ["Pai", "Mãe", "Endereço", "CEP", "CPF", "Número SUS", "Sexo", "Raça/Cor"]) {
  check(`Coluna dinâmica "${col}" presente`, headA.includes(col));
}

const rowFor = (sheet, head, nome) => {
  const r = sheet.find(row => row[0] === nome);
  return r ? Object.fromEntries(head.map((h, i) => [h, r[i]])) : null;
};
const rA1 = rowFor(sheetA, headA, "FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
const rA2 = rowFor(sheetA, headA, "FICTICIOAAL FICTICIOAAM FICTICIOAAN");
check("Linha FICTICIOAAI existe", !!rA1);
check("Linha FICTICIOAAL existe", !!rA2);
check("FICTICIOAAI · CPF = 27781584139", rA1?.["CPF"] === "27781584139", `obteve "${rA1?.["CPF"]}"`);
check("FICTICIOAAI · Pai = FICTICIOAAQ FICTICIOAAJ FICTICIOAAK", rA1?.["Pai"] === "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK");
check("FICTICIOAAI · SUS = 03713587473617", rA1?.["Número SUS"] === "03713587473617");
check("FICTICIOAAL · CPF = 57469296115", rA2?.["CPF"] === "57469296115", `obteve "${rA2?.["CPF"]}"`);
check("FICTICIOAAL · País de Origem = FICTICIOACQ", rA2?.["País de Origem"] === "FICTICIOACQ");
check("FICTICIOAAL · Entrada = 23-05-2018", rA2?.["Entrada"] === "23-05-2018");
check("FICTICIOAAL · célula vazia onde não tem dado (Escolaridade)", !rA2?.["Escolaridade"]);


console.log("\n═══ 3: Excel clientMode — caminho FICTICIOAAP (frontend manda people com extras) ═══");
const consolidatedB = {
  document_name: "ficha_dupla_payload",
  fields: fichaDupla,
  people: extractPeopleFromNumberedFields(fichaDupla),   
  tables: [],
  warnings: [],
  rows: [],
  headers: [],
  total_pages: 1,
};
const excelB = generateExcel(consolidatedB, { clientMode: true });
const wbB = XLSX.read(excelB.buffer, { type: "buffer" });
const sheetB = XLSX.utils.sheet_to_json(wbB.Sheets["Pessoas"], { header: 1 });
const headB = sheetB[0] || [];

check("2 linhas (sem duplicar pivot + explícito)", sheetB.length === 3, `obteve ${sheetB.length - 1}`);
check("Colunas dinâmicas presentes no caminho ficticioaap", headB.includes("CPF") && headB.includes("Pai"));
const rB1 = rowFor(sheetB, headB, "FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
check("FICTICIOAAI · CPF presente no caminho ficticioaap", rB1?.["CPF"] === "27781584139");


console.log("\n═══ 4: regressão — doc com SÓ os 5 campos mantém layout antigo ═══");
const somenteCinco = [
  f("Nome completo (1)", "FICTICIOABP FICTICIOABQ DE FICTICIOAAT"),
  f("Telefone com DDD (1)", "44.286110-997"),
  f("Cidade (1)", "FICTICIOABR FICTICIOABS"),
  f("Data de nascimento (1)", "02.09.2002"),
  f("E-mail ou instagram (1)", "CONTATOAMJ@example.test"),
];
const excelC = generateExcel({
  document_name: "cinco_campos", fields: somenteCinco, people: [], tables: [],
  warnings: [], rows: [], headers: [], total_pages: 1,
}, { clientMode: true });
const wbC = XLSX.read(excelC.buffer, { type: "buffer" });
const headC = (XLSX.utils.sheet_to_json(wbC.Sheets["Pessoas"], { header: 1 })[0]) || [];
check("Headers EXATAMENTE os 6 clássicos",
  JSON.stringify(headC) === JSON.stringify(["Nome completo", "Telefone", "Cidade", "Data de nascimento", "E-mail/Instagram", "Página"]),
  JSON.stringify(headC));


console.log("\n═══ 5: guarda — campos numerados de NOTA/PEDIDO não viram pessoas ═══");
const notaFiscal = [
  f("Item (1)", "PARAFUSO M6"),
  f("Valor (1)", "R$ 12,50"),
  f("Item (2)", "PORCA M6"),
  f("Valor (2)", "R$ 8,00"),
];
const pessoasNota = extractPeopleFromNumberedFields(notaFiscal).filter(p => !isEmptyPerson(p));
check("Nenhuma pessoa criada a partir de itens de nota", pessoasNota.length === 0, `obteve ${pessoasNota.length}`);


console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
