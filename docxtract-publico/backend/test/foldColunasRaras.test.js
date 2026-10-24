// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel, mergeExtraColumns } from "../src/services/excelService.js";
import { clientBuildPeopleTable } from "./_frontendConsolidate.fixture.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};
const person = (nome, extra) => ({
  nome_completo: nome, telefone: null, cidade: null, data_nascimento: null,
  email_ou_instagram: null, funcao_cargo: null, extra_fields: extra, page: 1,
});
const headOf = (people) => {
  const wb = XLSX.read(generateExcel({ document_name: "x", fields: [], people, tables: [], warnings: [], rows: [], headers: [] }, { clientMode: true }).buffer, { type: "buffer" });
  const a = XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 });
  return { head: a[0], rows: a.slice(1), aoa: a };
};


const big = Array.from({ length: 30 }, (_, i) => person(`PESSOA ${String(i).padStart(2, "0")}`, { "CPF": `cpf${i}`, "Sexo": "M" }));
big[0].extra_fields["Observação Rara"] = "segredo do zero";
big[5].extra_fields["Telefone Adicional Tia"] = "44222222222";

console.log("═══ Documento GRANDE (30 pessoas): raras → 'Outros dados' ═══");
const g = headOf(big);
check("Coluna 'CPF' mantida (comum)", g.head.includes("CPF"));
check("Coluna 'Sexo' mantida (comum)", g.head.includes("Sexo"));
check("Coluna 'Observação Rara' NÃO é coluna própria", !g.head.includes("Observação Rara"));
check("Coluna 'Telefone Adicional Tia' NÃO é coluna própria", !g.head.includes("Telefone Adicional Tia"));
check("Existe coluna 'Outros dados'", g.head.includes("Outros dados"), JSON.stringify(g.head));
const oi = g.head.indexOf("Outros dados");
const rowP0 = g.rows.find(r => r[0] === "PESSOA 00");
const rowP5 = g.rows.find(r => r[0] === "PESSOA 05");
const rowP1 = g.rows.find(r => r[0] === "PESSOA 01");
check("Dado raro preservado em Outros (pessoa 00)", String(rowP0[oi]).includes("Observação Rara: segredo do zero"), rowP0[oi]);
check("Dado raro preservado em Outros (pessoa 05)", String(rowP5[oi]).includes("Telefone Adicional Tia: 44222222222"), rowP5[oi]);
check("Pessoa sem raro → Outros vazio", !String(rowP1[oi] || "").trim());
check("Grade ENXUTA (poucas colunas: Nome, CPF, Sexo, Outros, Página = 5)", g.head.length === 5, JSON.stringify(g.head));

console.log("\n═══ Documento PEQUENO (8 pessoas): mantém TODAS as colunas ═══");
const small = Array.from({ length: 8 }, (_, i) => person(`P${i}`, { "CPF": `c${i}` }));
small[0].extra_fields["Observação Rara"] = "x";
const sm = headOf(small);
check("Pequeno NÃO tem 'Outros dados'", !sm.head.includes("Outros dados"), JSON.stringify(sm.head));
check("Pequeno mantém 'Observação Rara' como coluna", sm.head.includes("Observação Rara"));

console.log("\n═══ Paridade preview (frontend) == Excel (backend) ═══");
const pv = clientBuildPeopleTable(big, []);
check("Colunas do preview == Excel (com folding)", JSON.stringify(pv.headers) === JSON.stringify(g.head),
  `\n  prev=${JSON.stringify(pv.headers)}\n  excel=${JSON.stringify(g.head)}`);
const pvOi = pv.headers.indexOf("Outros dados");
check("Preview: mesmo 'Outros' na pessoa 00", String(pv.rows.find(r => r[0] === "PESSOA 00")[pvOi]).includes("Observação Rara"));

console.log("\n═══ mergeExtraColumns (unidade): sem raras → sem 'Outros' ═══");
const uniformes = Array.from({ length: 25 }, (_, i) => person(`U${i}`, { "CPF": `c${i}`, "Sexo": "M" }));
const m = mergeExtraColumns(uniformes);
check("Todas comuns → não cria 'Outros dados'", !m.labels.includes("Outros dados"), JSON.stringify(m.labels));

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
