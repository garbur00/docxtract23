// Cenários e dados inteiramente sintéticos para testes automatizados.
import assert from "node:assert/strict";
import { validatePageExtraction, validateReviewResponse } from "../src/services/validationService.js";

let pass = 0, fail = 0;
const check = (name, cond) => {
  console.log((cond ? "✓" : "✗") + " " + name);
  cond ? pass++ : fail++;
};


const t1 = validatePageExtraction({
  page: 1, document_type: "registration",
  fields: [{ name: "Deputada", value: "Pessoa Ficticia 064", confidence: 0.95, type: "text", warnings: [] }],
  people: [{ nome_completo: "Pessoa Ficticia 058", telefone: "11900000009", data_nascimento: "5/5/2004",
    cidade: "Cidade Ficticia 001", email_ou_instagram: "PESSOA002@EXAMPLE.TEST", confidence: 0.92, warnings: [] }],
  tables: [], warnings: [],
});
check("T1 telefone (11) 90000-0009", t1.data.people[0].telefone === "(11) 90000-0009");
check("T1 data 05/05/2004", t1.data.people[0].data_nascimento === "05/05/2004");
check("T1 email lowercase", t1.data.people[0].email_ou_instagram === "pessoa002@example.test");
check("T1 document_type registration", t1.data.document_type === "registration");


const t2 = validatePageExtraction({
  page: 1, fields: [],
  people: [{ nome_completo: "Pessoa Ficticia 034", telefone: "80000017", data_nascimento: null, cidade: null,
    email_ou_instagram: null, confidence: 0.9, warnings: [] }],
  tables: [], warnings: [],
});
check("T2 phone kept + warning", t2.data.people[0].telefone === "80000017" &&
  t2.data.people[0].warnings.some(w => w.includes("sem DDD")));


const t3 = validatePageExtraction({
  page: 1, fields: [],
  people: [{ nome_completo: "Pessoa Ficticia 059", telefone: null, data_nascimento: "31/02/2001", cidade: null,
    email_ou_instagram: null, confidence: 0.9, warnings: [] }],
  tables: [], warnings: [],
});
check("T3 invalid date warning", t3.data.people[0].warnings.some(w => w.includes("inválida")));


const t4 = validatePageExtraction({
  page: 1, fields: [],
  people: [{ nome_completo: "Pessoa Ficticia 060", telefone: null, data_nascimento: null, cidade: null,
    email_ou_instagram: "pessoa@@example.test", confidence: 0.9, warnings: [] }],
  tables: [], warnings: [],
});
check("T4 email suspect warning", t4.data.people[0].warnings.some(w => w.includes("e-mail")));


const t5 = validatePageExtraction({
  page: 1, document_type: "form",
  fields: [{ name: "Nome", value: "Pessoa Ficticia 061", confidence: 0.95, type: "text", warnings: [] }],
  tables: [], warnings: [],
});
check("T5 ok without people", t5.ok && Array.isArray(t5.data.people) && t5.data.people.length === 0);


const t6 = validatePageExtraction({
  page: 1, document_type: "table",
  fields: [{ name: "Empresa", value: "Acme", confidence: 0.9, type: "text", warnings: [] }],
  tables: [{ title: "Itens", headers: ["A", "B"], rows: [[{ value: "x", confidence: 0.9 }]] }],
  warnings: ["aviso geral"],
});
check("T6 fields/tables/warnings", t6.data.fields.length === 1 &&
  t6.data.tables.length === 1 && t6.data.warnings.includes("aviso geral"));


const t7 = validatePageExtraction({
  page: 1, fields: [],
  people: [{ nome_completo: "Pessoa Ficticia 062", telefone: "(11) 90000-0009", data_nascimento: "02/02/2001",
    cidade: "Cidade Ficticia 004", email_ou_instagram: null, confidence: 0.6, warnings: [] }],
  tables: [], warnings: [],
});
check("T7 low conf needs_review", t7.data.people[0].needs_review === true);


const t8 = validatePageExtraction({
  page: 1, fields: [],
  people: [{ nome_completo: "Pessoa Ficticia 063", telefone: "ilegível", data_nascimento: "-", cidade: "n/a",
    email_ou_instagram: "", confidence: 0.9, warnings: [] }],
  tables: [], warnings: [],
});
check("T8 illegible → null", t8.data.people[0].telefone === null &&
  t8.data.people[0].data_nascimento === null && t8.data.people[0].cidade === null);

// Invalid schema inputs must return structured issues with Zod 3 or 4.
let t9;
assert.doesNotThrow(() => { t9 = validatePageExtraction(null, { pageNumber: 3 }); });
check("T9 invalid root returns an empty page and error", t9.ok === false &&
  t9.data.page === 3 && t9.data.fields.length === 0 &&
  t9.issues.some(issue => issue.severity === "error" && issue.src === "schema"));

let t10;
assert.doesNotThrow(() => { t10 = validatePageExtraction({ page: 2, fields: "not-an-array" }); });
check("T10 invalid fields recover without losing the schema warning", t10.ok === true &&
  t10.data.page === 2 && t10.data.fields.length === 0 &&
  t10.issues.some(issue => issue.severity === "warning" && issue.src === "schema:fields"));

let t11;
assert.doesNotThrow(() => { t11 = validateReviewResponse({ reviewed_fields: [{ name: 123 }] }); });
check("T11 invalid review returns an empty review and issue path", t11.ok === false &&
  t11.data.reviewed_fields.length === 0 &&
  t11.issues.some(issue => issue.severity === "warning" && issue.src === "review:reviewed_fields.0.name"));

console.log(`\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
