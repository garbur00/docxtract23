// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};

const person = (name, page) => ({
  nome_completo: name, telefone: "(11) 90000-0009", cidade: "CIDADE FICTICIA 001",
  data_nascimento: "03/02/2000", email_ou_instagram: null,
  confidence: 0.95, needs_review: false, warnings: [], page,
});
const baseDoc = (people, processing) => ({
  document_name: "documento", generated_at: new Date().toISOString(),
  total_pages: processing?.totalPages ?? Math.max(...people.map(p => p.page)),
  fields: [], people, tables: [], warnings: [], rows: [], headers: [],
  processing,
});
const sheetRows = (buf, name) => {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }) : null;
};
const sheetNames = (buf) => XLSX.read(buf, { type: "buffer" }).SheetNames;


console.log("═══ CASO 1: tudo completo → Excel normal, sem aba Parcial ═══");
{
  const r = generateExcel(baseDoc([person("A", 1), person("B", 2)], {
    isPartial: false, status: "complete", totalPages: 2,
    successfulPages: [1, 2], failedPages: [], skippedPages: [],
  }), { clientMode: true });
  check("filename SEM _parcial", !/parcial/i.test(r.filename), r.filename);
  check("is_partial false", r.is_partial === false);
  check("sem aba ⚠ PARCIAL", !sheetNames(r.buffer).some(n => /PARCIAL/i.test(n)), sheetNames(r.buffer).join(","));
  check("aba Pessoas existe", sheetNames(r.buffer).includes("Pessoas"));
}


console.log("\n═══ CASO 2: página 2 falha por quota, 3-5 skipped → parcial ═══");
{
  const r = generateExcel(baseDoc([person("PESSOA FICTICIA 027", 1)], {
    isPartial: true, status: "partial_failed", totalPages: 5,
    successfulPages: [1], failedPages: [2], skippedPages: [3, 4, 5],
    stopReason: { page: 2, code: "quota" },
  }), { clientMode: true });

  check("filename indica parcial 1_de_5", /parcial_1_de_5_paginas/.test(r.filename), r.filename);
  check("is_partial true", r.is_partial === true);

  const names = sheetNames(r.buffer);
  check("aba de aviso é a PRIMEIRA", /PARCIAL/i.test(names[0]), names.join(","));
  check("aba Pessoas presente", names.includes("Pessoas"));

  const pessoas = sheetRows(r.buffer, "Pessoas").slice(1);
  check("Pessoas só tem página 1", pessoas.length === 1 && pessoas[0][pessoas[0].length - 1] === 1, JSON.stringify(pessoas));

  const aviso = sheetRows(r.buffer, names[0]).map(row => row.join(" ")).join(" | ").toLowerCase();
  check("aviso diz 'parcial'", aviso.includes("parcial"));
  check("aviso mostra 1 de 5", aviso.includes("1 de 5"));
  check("aviso lista não-processadas 3-5", aviso.includes("3-5"));
  check("aviso cita motivo quota/página 2", aviso.includes("página 2") || aviso.includes("pagina 2"));
}


console.log("\n═══ CASO 3: falha não-quota no meio, demais processam → parcial ═══");
{
  
  const r = generateExcel(baseDoc(
    [person("PESSOA FICTICIA 035", 1), person("PESSOA FICTICIA 036", 2), person("PESSOA FICTICIA 037", 4), person("PESSOA FICTICIA 038", 5)],
    { isPartial: true, status: "partial_failed", totalPages: 5,
      successfulPages: [1, 2, 4, 5], failedPages: [3], skippedPages: [],
      stopReason: null }
  ), { clientMode: true });
  check("filename parcial 4_de_5", /parcial_4_de_5_paginas/.test(r.filename), r.filename);
  const pessoas = sheetRows(r.buffer, "Pessoas").slice(1);
  check("4 pessoas (sem a página 3)", pessoas.length === 4 && !pessoas.some(p => p[5] === 3));
  const aviso = sheetRows(r.buffer, sheetNames(r.buffer)[0]).map(x => x.join(" ")).join(" ").toLowerCase();
  check("aviso lista falha pág 3", aviso.includes("3"));
}


console.log("\n═══ CASO 4: sem metadados de processing → comportamento normal ═══");
{
  const r = generateExcel(baseDoc([person("A", 1)], undefined), { clientMode: true });
  check("filename normal", !/parcial/i.test(r.filename), r.filename);
  check("sem aba PARCIAL", !sheetNames(r.buffer).some(n => /PARCIAL/i.test(n)));
  check("is_partial false/undefined", !r.is_partial);
}


console.log("\n═══ CASO 5: status partial inferido por success < total ═══");
{
  
  const r = generateExcel(baseDoc([person("A", 1)], {
    totalPages: 3, successfulPages: [1], failedPages: [], skippedPages: [2, 3],
  }), { clientMode: true });
  check("inferiu parcial pelo total", r.is_partial === true, r.filename);
  check("filename 1_de_3", /parcial_1_de_3_paginas/.test(r.filename), r.filename);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
