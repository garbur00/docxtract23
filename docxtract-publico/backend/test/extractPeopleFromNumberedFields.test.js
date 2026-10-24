// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  extractPeopleFromNumberedFields,
  generateExcel,
} from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};




console.log("═══ CASO 1: Ficticioabp — dados reais, formato sujo ═══");
const samuelFields = [
  { name: "Nome completo_1",        value: "FICTICIOABP FICTICIOABQ DE FICTICIOAAT", confidence: 1.0, page: 1 },
  { name: "Telefone com DDD_1",     value: "44.286110-997",            confidence: 1.0, page: 1 },
  { name: "Cidade_1",               value: "FICTICIOABR FICTICIOABS",                confidence: 1.0, page: 1 },
  { name: "Data de nascimento_1",   value: "02.09.2002",               confidence: 1.0, page: 1 },
  { name: "E-mail ou instagram_1",  value: "CONTATOAMJ@example.test",     confidence: 1.0, page: 1 },
];
const r1 = extractPeopleFromNumberedFields(samuelFields);
check("1 pessoa extraída",                       r1.length === 1, `recebeu ${r1.length}`);
check("nome preservado",                         r1[0].nome_completo === "FICTICIOABP FICTICIOABQ DE FICTICIOAAT");
check("telefone normalizado p/ (44) 28611-0997", r1[0].telefone === "(44) 28611-0997", `obteve "${r1[0].telefone}"`);
check("cidade preservada FICTICIOABR FICTICIOABS",             r1[0].cidade === "FICTICIOABR FICTICIOABS");
check("data normalizada p/ 02/09/2002",          r1[0].data_nascimento === "02/09/2002", `obteve "${r1[0].data_nascimento}"`);
check("email em minúsculas",                     r1[0].email_ou_instagram === "contatoamj@example.test", `obteve "${r1[0].email_ou_instagram}"`);
check("confidence = 1.0 (média de campos 1.0)",  r1[0].confidence === 1.0);
check("needs_review = false (tudo limpo)",       r1[0].needs_review === false);
check("warnings vazio",                          r1[0].warnings.length === 0);




console.log("\n═══ CASO 2: 3 pessoas (Ficticioabp + Ficticioabt + Ficticioabw) ═══");
const threeFields = [
  ...samuelFields,
  { name: "Nome completo_2",       value: "FICTICIOABT FICTICIOAAJ FICTICIOABU FICTICIOABV", confidence: 1.0, page: 1 },
  { name: "Telefone com DDD_2",    value: "44.20160-0348",              confidence: 1.0, page: 1 },
  { name: "Cidade_2",              value: "FICTICIOABR FICTICIOABS",                  confidence: 1.0, page: 1 },
  { name: "Data de nascimento_2",  value: "20.12.2004",                 confidence: 1.0, page: 1 },
  { name: "E-mail ou instagram_2", value: "contatobei@example.test", confidence: 1.0, page: 1 },
  { name: "Nome completo_3",       value: "FICTICIOABW FICTICIOABX FICTICIOABY",   confidence: 0.9, page: 1 },
  { name: "Telefone com DDD_3",    value: "44.224136808",               confidence: 0.9, page: 1 },
  { name: "Cidade_3",              value: "FICTICIOABR FICTICIOABS",                  confidence: 0.9, page: 1 },
  { name: "Data de nascimento_3",  value: "08.10.74",                   confidence: 0.9, page: 1 },
  { name: "E-mail ou instagram_3", value: "",                           confidence: 0.9, page: 1 },
];
const r2 = extractPeopleFromNumberedFields(threeFields);
check("3 pessoas",                                 r2.length === 3);
check("#1 Ficticioabp telefone OK",                     r2[0].telefone === "(44) 28611-0997");
check("#2 Ficticioabt telefone OK",                   r2[1].telefone === "(44) 20160-0348", `obteve "${r2[1].telefone}"`);
check("#3 Ficticioabw telefone (sem hífen visível)", r2[2].telefone === "(44) 22413-6808", `obteve "${r2[2].telefone}"`);
check("#3 data 08.10.74 → 08/10/1974 (ano 2 díg)", r2[2].data_nascimento === "08/10/1974", `obteve "${r2[2].data_nascimento}"`);
check("#3 email vazio → null (sem warning)",       r2[2].email_ou_instagram === null && !r2[2].warnings.some(w => w.includes("email_ou_instagram")));
check("#3 confidence média = 0.9",                 Math.abs(r2[2].confidence - 0.9) < 0.001);




console.log("\n═══ CASO 3: ano 2 dígitos (1960, 1961, 1974) ═══");
const r3 = extractPeopleFromNumberedFields([
  { name: "Nome completo_1",      value: "Pessoa A", confidence: 0.95, page: 1 },
  { name: "Data de nascimento_1", value: "29.06.60", confidence: 0.95, page: 1 },
  { name: "Nome completo_2",      value: "Pessoa B", confidence: 0.95, page: 1 },
  { name: "Data de nascimento_2", value: "18.02.61", confidence: 0.95, page: 1 },
  { name: "Nome completo_3",      value: "Pessoa C", confidence: 0.95, page: 1 },
  { name: "Data de nascimento_3", value: "08.10.74", confidence: 0.95, page: 1 },
]);
check("29.06.60 → 29/06/1960", r3[0].data_nascimento === "29/06/1960", `obteve "${r3[0].data_nascimento}"`);
check("18.02.61 → 18/02/1961", r3[1].data_nascimento === "18/02/1961", `obteve "${r3[1].data_nascimento}"`);
check("08.10.74 → 08/10/1974", r3[2].data_nascimento === "08/10/1974", `obteve "${r3[2].data_nascimento}"`);




console.log("\n═══ CASO 4: padrões alternativos (Email_1, DN_1, Instagram_1) ═══");
const r4 = extractPeopleFromNumberedFields([
  { name: "Nome_1",        value: "FICTICIOAAS",            confidence: 0.9, page: 1 },
  { name: "Celular_1",     value: "44222221111",    confidence: 0.9, page: 1 },
  { name: "Município_1",   value: "Ficticioabz",       confidence: 0.9, page: 1 },
  { name: "DN_1",          value: "22/05/1990",     confidence: 0.9, page: 1 },
  { name: "Email_1",       value: "CONTATOARH@example.test",   confidence: 0.9, page: 1 },
  { name: "Instagram 2",   value: "@ficticioaca_ficticioacb",   confidence: 0.9, page: 1 },
  { name: "Nome completo2",value: "FICTICIOACA FICTICIOACB",    confidence: 0.9, page: 1 },
]);
check("Reconheceu Nome_1 / Celular_1 / Ficticioaas_1 / DN_1 / Email_1", r4[0]?.nome_completo === "FICTICIOAAS" && r4[0]?.telefone === "(44) 22222-1111" && r4[0]?.cidade === "Ficticioabz" && r4[0]?.data_nascimento === "22/05/1990" && r4[0]?.email_ou_instagram === "contatoarh@example.test");
check("Reconheceu Instagram 2 e Nome completo2 (sem separador)", r4[1]?.nome_completo === "FICTICIOACA FICTICIOACB" && r4[1]?.email_ou_instagram === "@ficticioaca_ficticioacb");




console.log("\n═══ CASO 5: pessoa sem nome ═══");
const r5 = extractPeopleFromNumberedFields([
  { name: "Telefone_1", value: "44222221111", confidence: 0.9, page: 1 },
  { name: "Cidade_1",   value: "FICTICIOACC",          confidence: 0.9, page: 1 },
]);
check("needs_review=true (sem nome)", r5[0].needs_review === true);
check("warning sobre nome_completo",  r5[0].warnings.some(w => w.includes("nome_completo")));




console.log("\n═══ CASO 6: telefone inválido ═══");
const r6 = extractPeopleFromNumberedFields([
  { name: "Nome completo_1", value: "FICTICIOACD",     confidence: 0.9, page: 1 },
  { name: "Telefone_1",      value: "22221111",  confidence: 0.9, page: 1 },  
]);
check("telefone mantém original",        r6[0].telefone === "22221111");
check("warning sobre telefone sem DDD",  r6[0].warnings.some(w => w.toLowerCase().includes("ddd")));
check("needs_review=true",               r6[0].needs_review === true);




console.log("\n═══ CASO 7: sem campos numerados (não quebra) ═══");
const r7 = extractPeopleFromNumberedFields([
  { name: "Empresa",  value: "Acme",     confidence: 0.95, page: 1 },
  { name: "Data",     value: "08/01/2024", confidence: 0.95, page: 1 },
  { name: "Local",    value: "Ficticioace Ficticioabs", confidence: 0.95, page: 1 },
]);
check("array vazio (nenhuma pessoa)", r7.length === 0);




console.log("\n═══ CASO 8: input defensivo ═══");
check("[] retorna []",      extractPeopleFromNumberedFields([]).length === 0);
check("null retorna []",    extractPeopleFromNumberedFields(null).length === 0);
check("undefined retorna []", extractPeopleFromNumberedFields(undefined).length === 0);




console.log("\n═══ CASO 9: Excel gerado tem Pessoas como 1ª aba ═══");
const docFicha = {
  document_name: "ficha_alunos.pdf",
  generated_at: new Date().toISOString(),
  total_pages: 1, pipeline: "gemini → claude", providers_used: ["gemini"],
  fields: threeFields,  
  people: [],
  tables: [], warnings: [], rows: [], headers: [],
};
const exc = generateExcel(docFicha);
const wb = XLSX.read(exc.buffer, { type: "buffer" });
check("Aba 'Pessoas' existe",                wb.SheetNames.includes("Pessoas"));
check("Pessoas é a PRIMEIRA aba",            wb.SheetNames[0] === "Pessoas", `ordem: ${wb.SheetNames.join(", ")}`);
check("Abas antigas mantidas",               ["Dados", "Auditoria"].every(s => wb.SheetNames.includes(s)));
const pessoasRows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
check("Header tem 6 colunas",                pessoasRows[0].length === 6);
check("Header começa com 'Nome completo'",   pessoasRows[0][0] === "Nome completo");
check("3 linhas de pessoas (sem contar header)", pessoasRows.length === 4);
check("Linha 1 = Ficticioabp telefone normalizado",  pessoasRows[1][0] === "FICTICIOABP FICTICIOABQ DE FICTICIOAAT" && pessoasRows[1][1] === "(44) 28611-0997");
check("Linha 2 = Ficticioabt data normalizada",    pessoasRows[2][0] === "FICTICIOABT FICTICIOAAJ FICTICIOABU FICTICIOABV" && pessoasRows[2][3] === "20/12/2004");
check("Linha 3 = Ficticioabw sem email",          pessoasRows[3][0] === "FICTICIOABW FICTICIOABX FICTICIOABY" && (pessoasRows[3][4] ?? "") === "");


const audit = XLSX.utils.sheet_to_json(wb.Sheets["Auditoria"], { header: 1 });
const origemRow = audit.find(r => r[0] === "Origem das pessoas");
check("Auditoria marca 'derivado de fields[]'", origemRow && /derivado/i.test(origemRow[1]));
const totalPessoasRow = audit.find(r => r[0] === "Pessoas extraídas");
check("Auditoria mostra total = 3", totalPessoasRow && Number(totalPessoasRow[1]) === 3);




console.log("\n═══ CASO 10: people[] da IA tem prioridade ═══");
const docComPeople = {
  document_name: "x.pdf", generated_at: new Date().toISOString(),
  fields: [
    
    { name: "Nome completo_1", value: "PESSOA SINTETICA DO CAMPO", confidence: 1.0, page: 1 },
  ],
  people: [
    
    { nome_completo: "DA IA", telefone: "(44) 22222-1111", cidade: "X", data_nascimento: "08/01/2000", email_ou_instagram: "contatoadq@example.test", confidence: 0.95, needs_review: false, warnings: [], page: 1 },
  ],
  tables: [], warnings: [], rows: [], headers: [],
};
const exc2 = generateExcel(docComPeople);
const wb2 = XLSX.read(exc2.buffer, { type: "buffer" });
const pr2 = XLSX.utils.sheet_to_json(wb2.Sheets["Pessoas"], { header: 1 });
check("Usa people[] da IA (não derivado)", pr2[1][0] === "DA IA");
const audit2 = XLSX.utils.sheet_to_json(wb2.Sheets["Auditoria"], { header: 1 });
const origem2 = audit2.find(r => r[0] === "Origem das pessoas");
check("Auditoria marca 'IA direto'", origem2 && /IA direto/i.test(origem2[1]));




console.log("\n═══ CASO 11: Avisos com colunas detalhadas ═══");
const docComProblema = {
  document_name: "x.pdf", generated_at: new Date().toISOString(),
  fields: [
    { name: "Nome completo_1",      value: "FICTICIOABF",       confidence: 0.9, page: 1 },
    { name: "Telefone_1",           value: "22221111",   confidence: 0.9, page: 1 },  
    { name: "Data de nascimento_1", value: "31/13/2020", confidence: 0.9, page: 1 },  
  ],
  people: [], tables: [], warnings: [], rows: [], headers: [],
};
const exc3 = generateExcel(docComProblema);
const wb3 = XLSX.read(exc3.buffer, { type: "buffer" });
check("Aba 'Avisos' existe", wb3.SheetNames.includes("Avisos"));
const avi = XLSX.utils.sheet_to_json(wb3.Sheets["Avisos"], { header: 1 });
check("Avisos tem header de 6 colunas", avi[0].length === 6 && avi[0][0] === "Severidade" && avi[0][3] === "Valor original");
const telWarn = avi.find(r => r[2] === "telefone");
check("Aviso de telefone tem valor original 22221111", telWarn && telWarn[3] === "22221111");
const dataWarn = avi.find(r => r[2] === "data_nascimento");
check("Aviso de data tem valor original 31/13/2020", dataWarn && dataWarn[3] === "31/13/2020");


console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
