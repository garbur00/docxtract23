// Cenários e dados exclusivamente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { consolidateDocument } from "../src/services/consolidationService.js";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value, extra = {}) => ({ name, value, confidence: 0.92, ...extra });

const excelFromPage = (fields) => {
  const consolidated = consolidateDocument(
    [{ page: 1, fields, people: [], tables: [], warnings: [] }],
    { documentName: "ficticioacd" }
  );
  const excel = generateExcel(consolidated, { clientMode: true });
  const wb = XLSX.read(excel.buffer, { type: "buffer" });
  const sheet = wb.Sheets["Pessoas"]
    ? XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 })
    : [];
  const head = sheet[0] || [];
  const rowFor = (nome) => {
    const r = sheet.slice(1).find(row => row[0] === nome);
    return r ? Object.fromEntries(head.map((h, i) => [h, r[i]])) : null;
  };
  return { wb, sheet, head, rowFor, consolidated };
};


console.log("═══ A: IA devolve campos SEM índice (fichas repetidas + valores compartilhados) ═══");

const semIndice = [
  
  f("Nome", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Data de nascimento", "17-11-1946"),
  f("Pai", "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK"),
  f("Mãe", "FICTICIOAAU FICTICIOAAV DE FICTICIOAAW"),
  f("Endereço", "FICTICIOACF FICTICIOACG"),
  f("Bairro", "FICTICIOACH FICTICIOACI"),
  f("CEP", "46554513"),
  f("Cidade", "FICTICIOAAX FICTICIOAAY"),          
  f("Estado", "FICTICIOABE"),                        
  f("Telefone", "(44) 201621165"),
  f("Sexo", "Masculino"),                   
  f("Raça/Cor", "Parda"),                   
  f("Número SUS", "03713587473617"),
  f("CPF", "27781584139"),
  
  f("Nome", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Data de nascimento", "17-10-1994"),
  f("Pai", "FICTICIOAAL FICTICIOAAR"),
  f("Mãe", "FICTICIOAAZ FICTICIOABA"),
  f("Endereço", "FICTICIOACF FICTICIOACJ FICTICIOACK"),
  f("Bairro", "FICTICIOACH FICTICIOACL"),
  f("CEP", "46556533"),
  f("Cidade", "FICTICIOAAX FICTICIOAAY"),
  f("Estado", "FICTICIOABE"),
  f("Telefone", "(44) 209935970"),
  f("Sexo", "Masculino"),
  f("Raça/Cor", "Parda"),
  f("Número SUS", "03853878160150"),
  f("CPF", "57469296115"),
];

const A = excelFromPage(semIndice);
check("2 pessoas no Excel", A.sheet.length === 3, `obteve ${A.sheet.length - 1} linha(s)`);
const a1 = A.rowFor("FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
const a2 = A.rowFor("FICTICIOAAL FICTICIOAAM FICTICIOAAN");
check("FICTICIOAAI existe", !!a1);
check("FICTICIOAAL existe", !!a2);
check("FICTICIOAAI · CPF correto (não misturou fichas)", a1?.["CPF"] === "27781584139", `obteve "${a1?.["CPF"]}"`);
check("FICTICIOAAL · CPF correto", a2?.["CPF"] === "57469296115", `obteve "${a2?.["CPF"]}"`);
check("FICTICIOAAI · Pai correto", a1?.["Pai"] === "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK");
check("FICTICIOAAL · Pai correto", a2?.["Pai"] === "FICTICIOAAL FICTICIOAAR");
check("Cidade COMPARTILHADA presente na ficha 1", a1?.["Cidade"] === "FICTICIOAAX FICTICIOAAY", `obteve "${a1?.["Cidade"]}"`);
check("Cidade COMPARTILHADA presente na ficha 2", a2?.["Cidade"] === "FICTICIOAAX FICTICIOAAY", `obteve "${a2?.["Cidade"]}"`);
check("Sexo compartilhado presente nas duas", a1?.["Sexo"] === "Masculino" && a2?.["Sexo"] === "Masculino");
check("Estado compartilhado presente nas duas", a1?.["Estado"] === "FICTICIOABE" && a2?.["Estado"] === "FICTICIOABE");
check("Telefones normalizados distintos",
  a1?.["Telefone"] === "(44) 20162-1165" && a2?.["Telefone"] === "(44) 20993-5970",
  `obteve "${a1?.["Telefone"]}" / "${a2?.["Telefone"]}"`);


console.log("\n═══ B: IA numera mas REPETE o índice (1) nas duas fichas ═══");
const indiceRepetido = [
  
  f("Nome (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Data de nascimento (1)", "17-11-1946"),
  f("Pai (1)", "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),   
  f("Sexo (1)", "Masculino"),            
  f("Telefone (1)", "(44) 201621165"),
  f("CPF (1)", "27781584139"),
  
  f("Nome (1)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Data de nascimento (1)", "17-10-1994"),
  f("Pai (1)", "FICTICIOAAL FICTICIOAAR"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),
  f("Sexo (1)", "Masculino"),
  f("Telefone (1)", "(44) 209935970"),
  f("CPF (1)", "57469296115"),
];

const B = excelFromPage(indiceRepetido);
check("2 pessoas (antes: a 2ª era descartada)", B.sheet.length === 3, `obteve ${B.sheet.length - 1} linha(s)`);
const b1 = B.rowFor("FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
const b2 = B.rowFor("FICTICIOAAL FICTICIOAAM FICTICIOAAN");
check("FICTICIOAAI recuperado", !!b1);
check("FICTICIOAAL recuperado (era o que sumia)", !!b2);
check("FICTICIOAAI · CPF não misturado", b1?.["CPF"] === "27781584139", `obteve "${b1?.["CPF"]}"`);
check("FICTICIOAAL · CPF não misturado", b2?.["CPF"] === "57469296115", `obteve "${b2?.["CPF"]}"`);
check("FICTICIOAAL · Pai da ficha certa", b2?.["Pai"] === "FICTICIOAAL FICTICIOAAR", `obteve "${b2?.["Pai"]}"`);
check("FICTICIOAAL · data da ficha certa", b2?.["Data de nascimento"] === "17/10/1994", `obteve "${b2?.["Data de nascimento"]}"`);


check("Cidade compartilhada na ficha 1", b1?.["Cidade"] === "FICTICIOAAX FICTICIOAAY", `obteve "${b1?.["Cidade"]}"`);
check("Cidade compartilhada na ficha 2 (era a limitação)", b2?.["Cidade"] === "FICTICIOAAX FICTICIOAAY", `obteve "${b2?.["Cidade"]}"`);
check("Sexo compartilhado nas duas fichas", b1?.["Sexo"] === "Masculino" && b2?.["Sexo"] === "Masculino",
  `obteve "${b1?.["Sexo"]}" / "${b2?.["Sexo"]}"`);


console.log("\n═══ C: guards — sem pessoas-fantasma ═══");


const checkboxRepetido = [
  f("Nome completo (1)", "FICTICIOABP FICTICIOABQ DE FICTICIOAAT"),
  f("Telefone (1)", "(44) 28611-0997"),
  f("Cidade (1)", "FICTICIOABR FICTICIOABS"),
  f("Vereador (1)", "", { visual_evidence: false }),
  f("Vereador (1)", "X", { visual_evidence: true }),
];
const C1 = excelFromPage(checkboxRepetido);
check("1 pessoa apenas (checkbox duplicado não vira gente)", C1.sheet.length === 2, `obteve ${C1.sheet.length - 1} linha(s)`);
const c1row = C1.rowFor("FICTICIOABP FICTICIOABQ DE FICTICIOAAT");
check("Função/Cargo = Vereador preservado", c1row?.["Função/Cargo"] === "Vereador", `obteve "${c1row?.["Função/Cargo"]}"`);


const fichaUnicaEco = [
  f("Nome (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),
  f("Observação", "NIS: 9172797"),
  f("Observação", "NIS: 9172797"),   
];
const C2 = excelFromPage(fichaUnicaEco);
check("1 pessoa apenas na ficha única", C2.sheet.length === 2, `obteve ${C2.sheet.length - 1} linha(s)`);
const obsFields = C2.consolidated.fields.filter(x => x.name.startsWith("Observação"));
check("Eco colapsado em 1 campo (sem replicação)", obsFields.length === 1, `obteve ${obsFields.length}`);


console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
