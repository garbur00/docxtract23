// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";
import { consolidatePages } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};


const numberedPage = (pg, count) => ({
  page: pg, people: [],
  fields: Array.from({ length: count }, (_, i) => ([
    { name: `Nome completo (${i + 1})`, value: `Pessoa Ficticia P${pg} I${i + 1}`, page: pg, confidence: 1 },
    { name: `Telefone com DDD (${i + 1})`, value: `1199${pg}${i}0000`, page: pg, confidence: 1 },
  ])).flat(),
});


const unnumberedPage = (pg, count) => ({
  page: pg, people: [],
  fields: Array.from({ length: count }, (_, i) => ([
    { name: "Nome completo", value: `Pessoa Ficticia P${pg} I${i + 1}`, page: pg, confidence: 1 },
    { name: "Telefone com DDD", value: `1199${pg}${i}0000`, page: pg, confidence: 1 },
  ])).flat(),
});
const emptyPage = (pg) => ({ page: pg, people: [], fields: [] });

const excelPeopleByPage = (consol) => {
  const payload = { document_name: "x", total_pages: 15, fields: consol.allFields, people: consol.allPeople, tables: consol.allTables };
  const r = generateExcel(payload, { clientMode: true });
  const wb = XLSX.read(r.buffer, { type: "buffer" });
  const rows = wb.Sheets["Pessoas"]
    ? XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1, blankrows: false }).slice(1) : [];
  const byPage = {};
  rows.forEach(x => { const pg = x[x.length - 1]; byPage[pg] = (byPage[pg] || 0) + 1; });
  return { byPage, total: rows.length };
};


console.log("═══ 1: contagem variável por página (62 no total, pág 14 sem índices) ═══");
{
  const expected = { 1:5, 2:5, 3:4, 4:4, 5:1, 6:4, 7:5, 8:4, 9:5, 10:5, 11:3, 12:2, 13:5, 14:5, 15:5 };
  const pages = Object.entries(expected).map(([pg, n]) =>
    Number(pg) === 14 ? unnumberedPage(14, n) : numberedPage(Number(pg), n)
  );
  const c = consolidatePages(pages);
  const { byPage, total } = excelPeopleByPage(c);
  check("total = 62", total === 62, `obtido ${total}`);
  check("página 5 = 1 (não inflada)", byPage[5] === 1, `${byPage[5]}`);
  check("página 11 = 3", byPage[11] === 3, `${byPage[11]}`);
  check("página 12 = 2", byPage[12] === 2, `${byPage[12]}`);
  check("PÁGINA 14 = 5 (recuperada)", byPage[14] === 5, `${byPage[14] ?? 0}`);
  check("nomes da pág 14 corretos", c.allPeople.filter(p => p.page === 14).map(p => p.nome_completo).join(",").includes("Pessoa Ficticia P14 I1"));
  const ok = Object.entries(expected).every(([pg, n]) => byPage[pg] === n);
  check("todas as 15 páginas batem com o esperado", ok, JSON.stringify(byPage));
}


console.log("\n═══ 2: páginas vazias não alucinam pessoas ═══");
{
  const c = consolidatePages([numberedPage(1, 2), emptyPage(2), emptyPage(3)]);
  const { byPage, total } = excelPeopleByPage(c);
  check("total = 2 (só pág 1)", total === 2, `${total}`);
  check("págs 2 e 3 ausentes", byPage[2] === undefined && byPage[3] === undefined);
}


console.log("\n═══ 3: dedupe não remove página de estrutura parecida ═══");
{
  
  const c = consolidatePages([numberedPage(1, 3), numberedPage(2, 3)]);
  const { byPage, total } = excelPeopleByPage(c);
  check("6 pessoas (3+3)", total === 6, `${total}`);
  check("ambas as páginas presentes", byPage[1] === 3 && byPage[2] === 3, JSON.stringify(byPage));
}


console.log("\n═══ 4: dedupe mantém duplicata REAL (mesmo nome, mesmo valor) ═══");
{
  const page = { page: 1, people: [], fields: [
    { name: "Nome completo (1)", value: "PESSOA FICTICIA 034", page: 1, confidence: 0.5 },
    { name: "Nome completo (1)", value: "PESSOA FICTICIA 034", page: 1, confidence: 0.9 }, 
    { name: "Telefone com DDD (1)", value: "11900000015", page: 1, confidence: 1 },
  ]};
  const c = consolidatePages([page]);
  check("1 pessoa só (dupe colapsada)", c.allPeople.length === 1, `${c.allPeople.length}`);
  check("manteve a de maior confiança", c.allFields.find(f => f.name === "Nome completo (1)").confidence === 0.9);
}


console.log("\n═══ 5: pessoa só com função/cargo não é descartada (regra 9) ═══");
{
  const payload = { document_name: "x", total_pages: 1, fields: [], tables: [], people: [
    { nome_completo: null, telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, funcao_cargo: "Liderança Política", page: 1 },
    { nome_completo: null, telefone: null, cidade: null, data_nascimento: null, email_ou_instagram: null, funcao_cargo: null, page: 1 }, 
  ]};
  const r = generateExcel(payload, { clientMode: true });
  const wb = XLSX.read(r.buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1, blankrows: false }).slice(1);
  check("mantém 1 (com cargo), remove 1 (vazia)", rows.length === 1, `${rows.length}`);
}


console.log("\n═══ 6: página mista numerada+sem número no MESMO doc ═══");
{
  const c = consolidatePages([numberedPage(1, 5), unnumberedPage(2, 4), numberedPage(3, 1)]);
  const { byPage, total } = excelPeopleByPage(c);
  check("10 pessoas (5+4+1)", total === 10, `${total} ${JSON.stringify(byPage)}`);
  check("pág 2 recuperada com 4", byPage[2] === 4, `${byPage[2]}`);
}

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
