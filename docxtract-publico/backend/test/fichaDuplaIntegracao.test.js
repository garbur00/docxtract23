// Cenários e dados exclusivamente sintéticos para testes automatizados.
import express from "express";
import * as XLSX from "xlsx";
import { consolidateDocument } from "../src/services/consolidationService.js";
import { generateExcel, extractPeopleFromNumberedFields } from "../src/services/excelService.js";
import documentsRouter from "../src/routes/documents.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail || ""}`));
  cond ? pass++ : fail++;
};
const f = (name, value) => ({ name, value, confidence: 0.92 });

const sheetPessoas = (buffer) => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets["Pessoas"]
    ? XLSX.utils.sheet_to_json(wb.Sheets["Pessoas"], { header: 1 })
    : [];
  const head = sheet[0] || [];
  const rowFor = (nome) => {
    const r = sheet.slice(1).find(row => row[0] === nome);
    return r ? Object.fromEntries(head.map((h, i) => [h, r[i]])) : null;
  };
  return { wb, sheet, head, rowFor };
};


console.log("═══ A: 2 páginas × 2 fichas — página 2 com índice repetido pela IA ═══");


const pagina1 = [
  f("Nome (1)", "FICTICIOAAI FICTICIOAAJ FICTICIOAAK"),
  f("Data de nascimento (1)", "17-11-1946"),
  f("Pai (1)", "FICTICIOAAQ FICTICIOAAJ FICTICIOAAK"),
  f("Cidade (1)", "FICTICIOAAX FICTICIOAAY"),
  f("Telefone (1)", "(44) 201621165"),
  f("CPF (1)", "27781584139"),
  f("Nome (2)", "FICTICIOAAL FICTICIOAAM FICTICIOAAN"),
  f("Data de nascimento (2)", "17-10-1994"),
  f("Pai (2)", "FICTICIOAAL FICTICIOAAR"),
  f("Cidade (2)", "FICTICIOAAX FICTICIOAAY"),
  f("Telefone (2)", "(44) 209935970"),
  f("CPF (2)", "57469296115"),
];

const pagina2 = [
  f("Nome (1)", "FICTICIOAAV FICTICIOAAB FICTICIOABD"),
  f("Data de nascimento (1)", "12-03-1970"),
  f("Pai (1)", "FICTICIOAAJ FICTICIOABD"),
  f("Cidade (1)", "FICTICIOACM"),
  f("CPF (1)", "44455566610"),
  f("Nome (1)", "FICTICIOABF FICTICIOACN FICTICIOABL"),
  f("Data de nascimento (1)", "27-07-1985"),
  f("Pai (1)", "FICTICIOAAV FICTICIOABL"),
  f("Cidade (1)", "FICTICIOACM"),
  f("CPF (1)", "88899900079"),
];

const consolidated = consolidateDocument(
  [
    { page: 1, fields: pagina1, people: [], tables: [], warnings: [] },
    { page: 2, fields: pagina2, people: [], tables: [], warnings: [] },
  ],
  { documentName: "multipagina_fichas_duplas" }
);
const excelA = generateExcel(consolidated, { clientMode: true });
const A = sheetPessoas(excelA.buffer);

check("4 pessoas no total (2 por página)", A.sheet.length === 5, `obteve ${A.sheet.length - 1} linha(s)`);
const abdias = A.rowFor("FICTICIOAAI FICTICIOAAJ FICTICIOAAK");
const abdur = A.rowFor("FICTICIOAAL FICTICIOAAM FICTICIOAAN");
const maria = A.rowFor("FICTICIOAAV FICTICIOAAB FICTICIOABD");
const joao = A.rowFor("FICTICIOABF FICTICIOACN FICTICIOABL");
check("FICTICIOAAI presente (pág 1, numeração correta)", !!abdias);
check("FICTICIOAAL presente (pág 1)", !!abdur);
check("FICTICIOAAV presente (pág 2, índice repetido recuperado)", !!maria);
check("FICTICIOABF presente (pág 2, era o que sumiria)", !!joao);
check("Páginas corretas", abdias?.["Página"] === 1 && abdur?.["Página"] === 1 && maria?.["Página"] === 2 && joao?.["Página"] === 2,
  `obteve ${abdias?.["Página"]}/${abdur?.["Página"]}/${maria?.["Página"]}/${joao?.["Página"]}`);
check("CPFs não misturados entre páginas/fichas",
  abdias?.["CPF"] === "27781584139" && abdur?.["CPF"] === "57469296115" &&
  maria?.["CPF"] === "44455566610" && joao?.["CPF"] === "88899900079",
  `obteve ${abdias?.["CPF"]}/${abdur?.["CPF"]}/${maria?.["CPF"]}/${joao?.["CPF"]}`);
check("Pais não misturados na página com colisão",
  maria?.["Pai"] === "FICTICIOAAJ FICTICIOABD" && joao?.["Pai"] === "FICTICIOAAV FICTICIOABL",
  `obteve "${maria?.["Pai"]}" / "${joao?.["Pai"]}"`);
check("Cidade compartilhada da pág 2 nas duas fichas",
  maria?.["Cidade"] === "FICTICIOACM" && joao?.["Cidade"] === "FICTICIOACM",
  `obteve "${maria?.["Cidade"]}" / "${joao?.["Cidade"]}"`);
check("Ordem das linhas segue página/índice",
  A.sheet[1]?.[0] === "FICTICIOAAI FICTICIOAAJ FICTICIOAAK" && A.sheet[3]?.[0] === "FICTICIOAAV FICTICIOAAB FICTICIOABD",
  `linha1="${A.sheet[1]?.[0]}", linha3="${A.sheet[3]?.[0]}"`);


console.log("\n═══ B: roundtrip HTTP — POST /api/documents/excel (rota ficticioaap) ═══");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use((req, _res, next) => { req.requestId = "test-req"; next(); });
app.use("/api/documents", documentsRouter);
const srv = await new Promise(resolve => {
  const s = app.listen(0, () => resolve(s));
});
const port = srv.address().port;


const payload = {
  document_name: "ficha_dupla_http",
  generated_at: new Date().toISOString(),
  total_pages: 1,
  fields: pagina1.map(x => ({ ...x, page: 1 })),
  people: extractPeopleFromNumberedFields(pagina1.map(x => ({ ...x, page: 1 }))),
  tables: [],
  warnings: [],
  rows: [],
  headers: [],
};

const res = await fetch(`http://127.0.0.1:${port}/api/documents/excel`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ document: payload }),
});

check("HTTP 200", res.status === 200, `obteve ${res.status}`);
check("Content-Type de XLSX",
  (res.headers.get("content-type") || "").includes("spreadsheetml"),
  res.headers.get("content-type"));
check("Content-Disposition com nome do arquivo",
  /filename=".*\.xlsx"/.test(res.headers.get("content-disposition") || ""),
  res.headers.get("content-disposition"));

const buf = Buffer.from(await res.arrayBuffer());
check("Corpo é um XLSX válido (assinatura ZIP)", buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b);

const B = sheetPessoas(buf);
check("Aba Pessoas no arquivo baixado", B.wb.SheetNames.includes("Pessoas"));
check("2 pessoas no arquivo baixado", B.sheet.length === 3, `obteve ${B.sheet.length - 1}`);
check("Colunas dinâmicas sobrevivem ao HTTP", B.head.includes("Pai") && B.head.includes("CPF"), JSON.stringify(B.head));
const httpAbdur = B.rowFor("FICTICIOAAL FICTICIOAAM FICTICIOAAN");
check("FICTICIOAAL completo via HTTP", httpAbdur?.["CPF"] === "57469296115" && httpAbdur?.["Pai"] === "FICTICIOAAL FICTICIOAAR",
  `obteve CPF="${httpAbdur?.["CPF"]}", Pai="${httpAbdur?.["Pai"]}"`);

srv.close();


console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
