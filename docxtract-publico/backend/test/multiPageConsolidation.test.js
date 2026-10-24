// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel, isEmptyPerson } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};


function pessoasRows(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets["Pessoas"];
  if (!ws) return { header: [], rows: [] };
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  return { header: aoa[0] || [], rows: aoa.slice(1) };
}

const rowIsEmpty = (r) => r.slice(0, -1).every(v => v == null || String(v).trim() === "");
const namesOf = (rows) => rows.map(r => String(r[0] || "").trim()).filter(Boolean);
const pagesOf = (rows) => [...new Set(rows.map(r => r[r.length - 1]))].sort((a, b) => a - b);


const person = (name, page, extra = {}) => ({
  nome_completo: name, telefone: "(11) 90000-0009", cidade: "CIDADE FICTICIA 001",
  data_nascimento: "03/02/2000", email_ou_instagram: null,
  confidence: 0.95, needs_review: false, warnings: [], page, ...extra,
});

const numberedFields = (name, page, idx) => ([
  { name: `Nome completo (${idx})`,       value: name,        page, confidence: 1, warnings: [] },
  { name: `Telefone com DDD (${idx})`,    value: "11900000010", page, confidence: 1, warnings: [] },
  { name: `Cidade (${idx})`,              value: "CIDADE FICTICIA 001",  page, confidence: 1, warnings: [] },
  { name: `Data de nascimento (${idx})`,  value: "06/06/2005", page, confidence: 1, warnings: [] },
  { name: `E-mail ou instagram (${idx})`, value: "",           page, confidence: 1, warnings: [] },
]);
const doc = (people, fields, totalPages) => ({
  document_name: "teste.pdf",
  generated_at: new Date().toISOString(),
  total_pages: totalPages,
  fields, people, tables: [], warnings: [], rows: [], headers: [],
});


console.log("═══ CASO 1: 15 páginas × 5 pessoas = 75 (todas via fields numerados) ═══");
{
  const fields = [];
  for (let pg = 1; pg <= 15; pg++)
    for (let i = 1; i <= 5; i++) fields.push(...numberedFields(`P${pg}-PESSOA${i}`, pg, i));
  const { buffer } = generateExcel(doc([], fields, 15), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  check("75 linhas", rows.length === 75, `obtido ${rows.length}`);
  check("nenhuma linha vazia", rows.every(r => !rowIsEmpty(r)));
  check("15 páginas distintas", pagesOf(rows).length === 15, `obtido ${pagesOf(rows).length}`);
}


console.log("\n═══ CASO 2 (O BUG): páginas MISTAS people[] + fields[] numerados ═══");
{
  
  const people = [
    person("PESSOA FICTICIA 018", 3), person("PESSOA FICTICIA 019", 6),
    person("PESSOA FICTICIA 020", 7), person("PESSOA FICTICIA 021", 15),
  ];
  const fields = [
    ...numberedFields("PESSOA FICTICIA 022", 1, 1),
    ...numberedFields("PESSOA FICTICIA 023", 2, 1),
    ...numberedFields("PESSOA FICTICIA 024", 4, 1),
    ...numberedFields("PESSOA FICTICIA 025", 8, 1),
  ];
  const { buffer } = generateExcel(doc(people, fields, 15), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  const names = namesOf(rows);
  check("todas as 8 pessoas presentes", rows.length === 8, `obtido ${rows.length}`);
  check("inclui página people[] (EDSON)", names.includes("PESSOA FICTICIA 018"));
  check("inclui página fields[] (ALEXANDRE)", names.includes("PESSOA FICTICIA 022"), names.join(","));
  check("inclui página fields[] (FRED)", names.includes("PESSOA FICTICIA 025"));
  check("NÃO é só o subconjunto people[]", pagesOf(rows).join(",") === "1,2,3,4,6,7,8,15", pagesOf(rows).join(","));
}


console.log("\n═══ CASO 3: páginas fora de ordem → todas presentes, página correta ═══");
{
  
  const people = [person("PESSOA FICTICIA 026", 3), person("PESSOA FICTICIA 027", 1)];
  const fields = [...numberedFields("PESSOA FICTICIA 028", 8, 1), ...numberedFields("PESSOA FICTICIA 029", 4, 1)];
  const { buffer } = generateExcel(doc(people, fields, 8), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  check("4 pessoas", rows.length === 4, `obtido ${rows.length}`);
  check("páginas 1,3,4,8 (ordenadas)", pagesOf(rows).join(",") === "1,3,4,8", pagesOf(rows).join(","));
  const byPage = Object.fromEntries(rows.map(r => [r[r.length - 1], r[0]]));
  check("página 1 = PESSOA FICTICIA 027", byPage[1] === "PESSOA FICTICIA 027");
  check("página 8 = PESSOA FICTICIA 028", byPage[8] === "PESSOA FICTICIA 028");
}


console.log("\n═══ CASO 4: uma página falha (ausente) → demais presentes, sem vazias ═══");
{
  
  const people = [];
  for (let pg = 1; pg <= 15; pg++) if (pg !== 6) people.push(person(`PESSOA P${pg}`, pg));
  const { buffer } = generateExcel(doc(people, [], 15), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  check("14 pessoas (página 6 ausente)", rows.length === 14, `obtido ${rows.length}`);
  check("nenhuma linha vazia", rows.every(r => !rowIsEmpty(r)));
  check("página 6 não aparece", !pagesOf(rows).includes(6));
}


console.log("\n═══ CASO 5: blocos em branco → nenhuma pessoa vazia no Excel ═══");
{
  
  const people = [
    person("PESSOA FICTICIA 030", 5),
    { nome_completo: null, telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, page: 5, warnings: [] },
    { nome_completo: "", telefone: "", cidade: "", data_nascimento: "", email_ou_instagram: "", page: 5, warnings: [] },
  ];
  const fields = [
    
    { name: "Nome completo (2)", value: "", page: 5, confidence: 0, warnings: [] },
    { name: "Telefone com DDD (2)", value: "", page: 5, confidence: 0, warnings: [] },
    { name: "Cidade (2)", value: "", page: 5, confidence: 0, warnings: [] },
  ];
  const { buffer } = generateExcel(doc(people, fields, 5), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  check("só 1 pessoa (Ellen), zero vazias", rows.length === 1, `obtido ${rows.length}: ${JSON.stringify(rows)}`);
  check("Ellen presente", namesOf(rows).includes("PESSOA FICTICIA 030"));
  check("nenhuma linha vazia", rows.every(r => !rowIsEmpty(r)));
}


console.log("\n═══ CASO 6: caso REAL (replica documento__10_) — não pode ser só 3,5,6,7,15 ═══");
{
  
  const people = [
    person("PESSOA FICTICIA 031", 3), person("PESSOA FICTICIA 032", 6),
    person("PESSOA FICTICIA 020", 7), person("PESSOA FICTICIA 033", 15),
  ];
  const fields = [];
  for (const pg of [1, 2, 4, 8, 9, 10, 11, 12, 13, 14])
    fields.push(...numberedFields(`PESSOA P${pg}`, pg, 1));
  const { buffer } = generateExcel(doc(people, fields, 15), { clientMode: true });
  const { rows } = pessoasRows(buffer);
  const pages = pagesOf(rows);
  check("14 pessoas (4 people[] + 10 fields[])", rows.length === 14, `obtido ${rows.length}`);
  check("contém as 10 páginas antes perdidas", [1,2,4,8,9,10,11,12,13,14].every(p => pages.includes(p)), pages.join(","));
  check("não é apenas 3,5,6,7,15", JSON.stringify(pages) !== JSON.stringify([3,5,6,7,15]));
  check("nenhuma linha vazia", rows.every(r => !rowIsEmpty(r)));
}


console.log("\n═══ CASO 7: isEmptyPerson (unidade) ═══");
{
  check("tudo vazio → true", isEmptyPerson({ nome_completo: "", telefone: null }) === true);
  check("só página → true", isEmptyPerson({ page: 5 }) === true);
  check("com nome → false", isEmptyPerson({ nome_completo: "Pessoa Ficticia 034" }) === false);
  check("só telefone → false", isEmptyPerson({ telefone: "(11) 90000-0008" }) === false);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
