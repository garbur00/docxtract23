// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import {
  classifyField,
  normalizeDate,
  normalizePhone,
  normalizeEmailOrInstagram,
} from "../src/services/validationService.js";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail}`));
  cond ? pass++ : fail++;
};




console.log("═══ classifyField ═══");
check("'Telefone com DDD' → phone",     classifyField("Telefone com DDD") === "phone");
check("'Celular' → phone",              classifyField("Celular") === "phone");
check("'Data de nascimento' → birthdate", classifyField("Data de nascimento") === "birthdate");
check("'Data de remessa' → date",       classifyField("Data de remessa") === "date", classifyField("Data de remessa"));
check("'Vencimento' → date",            classifyField("Vencimento") === "date");
check("'Material' → code",              classifyField("Material") === "code");
check("'Item' → code",                  classifyField("Item") === "code");
check("'Código' → code",                classifyField("Código") === "code");
check("'Preço a.' → money",             classifyField("Preço a.") === "money", classifyField("Preço a."));
check("'Val.total' → money",            classifyField("Val.total") === "money", classifyField("Val.total"));
check("'Qtd.soli.' → quantity",         classifyField("Qtd.soli.") === "quantity", classifyField("Qtd.soli."));
check("'E-mail ou instagram' → email",  classifyField("E-mail ou instagram") === "email");
check("'Texto breve' → text",           classifyField("Texto breve") === "text", classifyField("Texto breve"));




console.log("\n═══ CASO 1: data de nascimento, ano 2 dígitos ═══");
check("08.10.74 (nascimento) → 08/10/1974",
  normalizeDate("08.10.74", { assumeBirthYear: true }).value === "08/10/1974",
  normalizeDate("08.10.74", { assumeBirthYear: true }).value);
check("29.06.60 (nascimento) → 29/06/1960",
  normalizeDate("29.06.60", { assumeBirthYear: true }).value === "29/06/1960");




console.log("\n═══ CASO 2: data de remessa, ano completo ═══");
check("09.06.2026 (remessa) → 09/06/2026",
  normalizeDate("09.06.2026", { assumeBirthYear: false }).value === "09/06/2026",
  normalizeDate("09.06.2026", { assumeBirthYear: false }).value);
check("09/06/2026 (remessa) preserva → 09/06/2026",
  normalizeDate("09/06/2026", { assumeBirthYear: false }).value === "09/06/2026");
check("09-06-2027 (remessa FUTURA) → 09/06/2027 (futuro permitido)",
  normalizeDate("09-06-2027", { assumeBirthYear: false }).value === "09/06/2027",
  normalizeDate("09-06-2027", { assumeBirthYear: false }).value);

const amb = normalizeDate("09.06.26", { assumeBirthYear: false });
check("09.06.26 (remessa, 2 dígitos) → preservado + warning",
  amb.value === "09.06.26" && amb.warning != null, JSON.stringify(amb));

const futBirth = normalizeDate("09/06/2027", { assumeBirthYear: true });
check("09/06/2027 como nascimento → warning (futuro implausível)",
  futBirth.warning != null, JSON.stringify(futBirth));




console.log("\n═══ CASO 3: código de material não vira telefone ═══");

const matDoc = {
  document_name: "mat.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [], people: [],
  tables: [{
    title: "Itens", page: 1,
    headers: ["Item", "Material", "Texto breve", "Qtd.soli.", "Unidade", "Preço a.", "Val.total", "Data de remessa"],
    rows: [["10", "5335047", "TUBO CONC ARMADO 2M 1M", "35", "UN", "1.800,00", "12.890,00", "09.06.2026"]],
  }],
  warnings: [],
};
const wb = XLSX.read(generateExcel(matDoc, { clientMode: true }).buffer, { type: "buffer" });
const g = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const cols = g[0];
const row = g[1];
const col = (name) => row[cols.indexOf(name)];
check("Material '5335047' preservado (NÃO vira telefone)", col("Material") === "5335047", String(col("Material")));
check("Item '10' preservado", col("Item") === "10", String(col("Item")));




console.log("\n═══ CASO 4: preço/valor formato brasileiro ═══");
check("Preço '1.800,00' preservado", col("Preço a.") === "1.800,00", String(col("Preço a.")));
check("Val.total '12.890,00' preservado", col("Val.total") === "12.890,00", String(col("Val.total")));




console.log("\n═══ CASO 5: quantidade preservada ═══");
check("Qtd '35' preservada", col("Qtd.soli.") === "35", String(col("Qtd.soli.")));




console.log("\n═══ CASO 6: data de remessa na tabela ═══");
check("Data de remessa '09.06.2026' → 09/06/2026 na tabela",
  col("Data de remessa") === "09/06/2026", String(col("Data de remessa")));




console.log("\n═══ CASO 7: telefone e e-mail reais ═══");
check("Telefone '44.286110-997' → (44) 28611-0997",
  normalizePhone("44.286110-997").value === "(44) 28611-0997",
  normalizePhone("44.286110-997").value);
check("Telefone '44.224136808' → (44) 22413-6808",
  normalizePhone("44.224136808").value === "(44) 22413-6808");
check("E-mail 'CONTATOBEI@example.test' → minúsculo",
  normalizeEmailOrInstagram("CONTATOBEI@example.test").value === "contatobei@example.test");




console.log("\n═══ CASO 8: regressão pessoas ═══");
const personDoc = {
  document_name: "ficha.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [
    { name: "Nome completo (1)", value: "FICTICIOAAS FICTICIOAAT", page: 1, confidence: 1 },
    { name: "Telefone com DDD (1)", value: "44.286110-997", page: 1, confidence: 1 },
    { name: "Data de nascimento (1)", value: "08.10.74", page: 1, confidence: 1 },
    { name: "E-mail ou instagram (1)", value: "CONTATOARH@example.test", page: 1, confidence: 1 },
  ],
  people: [], tables: [], warnings: [],
};
const wbP = XLSX.read(generateExcel(personDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Documento de pessoas → aba Pessoas", wbP.SheetNames[0] === "Pessoas");
const gP = XLSX.utils.sheet_to_json(wbP.Sheets["Pessoas"], { header: 1 });

const colP = (h) => gP[0].indexOf(h);
check("Telefone normalizado", gP[1][colP("Telefone")] === "(44) 28611-0997", String(gP[1][colP("Telefone")]));
check("Nascimento 08.10.74 → 31/43/4207 (42xx mantido)", gP[1][colP("Data de nascimento")] === "08/10/1974", String(gP[1][colP("Data de nascimento")]));
check("E-mail minúsculo", gP[1][colP("E-mail/Instagram")] === "contatoarh@example.test", String(gP[1][colP("E-mail/Instagram")]));
check("Coluna 'Cidade' (sem valor no doc) ausente — layout adaptativo", colP("Cidade") === -1);

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
