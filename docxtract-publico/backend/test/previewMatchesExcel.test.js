// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";
import { consolidatePages } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};


const peoplePage = (pg, count = 5) => Array.from({ length: count }, (_, i) => ({
  nome_completo: `P${pg}-PESSOA${i + 1}`,
  telefone: `1199${pg}0${i}000`, cidade: "CIDADE FICTICIA 001",
  data_nascimento: "04/04/2003", email_ou_instagram: `pessoa008@example.test`,
  confidence: 0.9, warnings: [],
}));

const numberedPage = (pg, count = 5) => Array.from({ length: count }, (_, i) => ([
  { name: `Nome completo (${i + 1})`, value: `P${pg}-PESSOA${i + 1}`, confidence: 1, warnings: [] },
  { name: `Telefone com DDD (${i + 1})`, value: `1199${pg}0${i}000`, confidence: 1, warnings: [] },
  { name: `Cidade (${i + 1})`, value: "CIDADE FICTICIA 001", confidence: 1, warnings: [] },
])).flat();


function pipeline(pages) {
  const c = consolidatePages(pages);                       
  const payload = {                                        
    document_name: "x", total_pages: pages.length,
    fields: c.allFields, people: c.allPeople, tables: c.allTables,
  };
  const r = generateExcel(payload, { clientMode: true });  
  const wb = XLSX.read(r.buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"] || {}, { header: 1, blankrows: false }).slice(1);
  return {
    previewPages: new Set(c.rows.map(x => x._page)).size,
    previewPeople: c.allPeople.length,
    payloadPeople: payload.people.length,
    excelRows: rows.length,
    excelPages: [...new Set(rows.map(x => x[5]))].sort((a, b) => a - b),
  };
}


console.log("═══ CASO 1: 2 páginas × 5 pessoas (people[]) → Excel com 10 ═══");
{
  const r = pipeline([
    { page: 1, people: peoplePage(1), fields: [] },
    { page: 2, people: peoplePage(2), fields: [] },
  ]);
  check("preview mostra 2 páginas", r.previewPages === 2, `${r.previewPages}`);
  check("payload tem 10 pessoas", r.payloadPeople === 10, `${r.payloadPeople}`);
  check("Excel tem 10 linhas", r.excelRows === 10, `${r.excelRows}`);
  check("Excel cobre páginas 1 e 2", JSON.stringify(r.excelPages) === "[1,2]", JSON.stringify(r.excelPages));
}


console.log("\n═══ CASO 2: misto — pág1 people[], pág2 fields[] numerados ═══");
{
  const r = pipeline([
    { page: 1, people: peoplePage(1), fields: [] },
    { page: 2, people: [], fields: numberedPage(2) },
  ]);
  check("payload 10 pessoas", r.payloadPeople === 10, `${r.payloadPeople}`);
  check("Excel 10 linhas", r.excelRows === 10, `${r.excelRows}`);
  check("Excel tem as 2 páginas", JSON.stringify(r.excelPages) === "[1,2]", JSON.stringify(r.excelPages));
}


console.log("\n═══ CASO 3: preview tem 2 págs → download NÃO pode mandar só a 1ª ═══");
{
  const r = pipeline([
    { page: 1, people: peoplePage(1, 3), fields: [] },
    { page: 2, people: peoplePage(2, 4), fields: [] },
  ]);
  check("payload reflete preview (7)", r.payloadPeople === r.previewPeople && r.payloadPeople === 7, `${r.payloadPeople}`);
  check("Excel NÃO é só página 1", r.excelPages.includes(2), JSON.stringify(r.excelPages));
  check("Excel tem 7 linhas", r.excelRows === 7, `${r.excelRows}`);
}


console.log("\n═══ CASO 4: backend recebe vários pageResults → todos escritos ═══");
{
  
  const people = [1, 2, 3, 4].flatMap(pg => peoplePage(pg, 5).map(p => ({ ...p, page: pg })));
  const r = generateExcel({ document_name: "x", total_pages: 4, fields: [], people, tables: [] }, { clientMode: true });
  const wb = XLSX.read(r.buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1, blankrows: false }).slice(1);
  const pages = [...new Set(rows.map(x => x[5]))].sort((a, b) => a - b);
  check("20 linhas", rows.length === 20, `${rows.length}`);
  check("4 páginas (não só 1ª/última)", JSON.stringify(pages) === "[1,2,3,4]", JSON.stringify(pages));
}


console.log("\n═══ CASO 5: fallback client-side (consolidatePages) cobre 2 páginas ═══");
{
  
  const c = consolidatePages([
    { page: 1, people: peoplePage(1), fields: [] },
    { page: 2, people: [], fields: numberedPage(2) },
  ]);
  const pages = [...new Set(c.allPeople.map(p => p.page))].sort((a, b) => a - b);
  check("allPeople tem 10", c.allPeople.length === 10, `${c.allPeople.length}`);
  check("allPeople cobre páginas 1 e 2", JSON.stringify(pages) === "[1,2]", JSON.stringify(pages));
}


console.log("\n═══ CASO 6: pessoa válida sem e-mail/telefone NÃO é descartada ═══");
{
  const c = consolidatePages([
    { page: 1, people: [
      { nome_completo: "PESSOA FICTICIA 046", telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, warnings: [] },
      { nome_completo: null, telefone: "(11) 90000-0001", cidade: null, data_nascimento: null, email_ou_instagram: null, warnings: [] },
      { nome_completo: null, telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, warnings: [] }, 
    ], fields: [] },
  ]);
  check("mantém 2 válidas, remove 1 vazia", c.allPeople.length === 2, `${c.allPeople.length}`);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
