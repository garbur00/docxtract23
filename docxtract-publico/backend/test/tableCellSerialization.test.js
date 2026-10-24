// Cenários e dados inteiramente sintéticos para testes automatizados.
import * as XLSX from "xlsx";
import { generateExcel } from "../src/services/excelService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail}`));
  cond ? pass++ : fail++;
};

const hasObjectObject = (wb) =>
  wb.SheetNames.some(sn => {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
    return g.flat().some(c => String(c).includes("[object Object]"));
  });




console.log("═══ CASO 1: células objeto { value, confidence } ═══");
const objDoc = {
  document_name: "mat.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [], people: [],
  tables: [{
    title: "Itens", page: 1,
    headers: ["Item", "C", "I", "Material", "Texto breve", "Qtd.soli.", "Unidade", "Preço a.", "Val.total", "T", "Data de remessa"],
    rows: [[
      { value: "10", confidence: 1 },
      { value: "P", confidence: 1 },
      { value: "—", confidence: 1 },
      { value: "9000004", confidence: 1 },
      { value: "TUBO CONC ARMADO 2M 1M", confidence: 1 },
      { value: "1", confidence: 1 },
      { value: "UN", confidence: 1 },
      { value: "1.800,00", confidence: 1 },
      { value: "1.800,00", confidence: 1 },
      { value: "D", confidence: 1 },
      { value: "07.07.2006", confidence: 1 },
    ]],
  }],
  warnings: [],
};
const wb1 = XLSX.read(generateExcel(objDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Aba = Itens", wb1.SheetNames[0] === "Itens", wb1.SheetNames.join(","));
check("NENHUM [object Object] em nenhuma célula", !hasObjectObject(wb1));
const g1 = XLSX.utils.sheet_to_json(wb1.Sheets["Itens"], { header: 1 });
const row1 = g1[1];
check("Item = 10", row1[0] === "10", String(row1[0]));
check("Material = 9000004 (código preservado)", row1[3] === "9000004", String(row1[3]));
check("Texto breve preservado", row1[4] === "TUBO CONC ARMADO 2M 1M", String(row1[4]));
check("Qtd = 1", row1[5] === "1", String(row1[5]));
check("Preço a. = 1.800,00 (BR)", row1[7] === "1.800,00", String(row1[7]));
check("Val.total = 1.800,00 (BR)", row1[8] === "1.800,00", String(row1[8]));
check("Data de remessa 07.07.2006 → 07/07/2006", row1[10] === "07/07/2006", String(row1[10]));
check("Página = 1", row1[11] === 1, String(row1[11]));




console.log("\n═══ CASO 2: células primitivas e mistas ═══");
const mixDoc = {
  document_name: "mix.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [], people: [],
  tables: [{
    title: "Itens", page: 1,
    headers: ["Item", "Material", "Preço a."],
    rows: [
      ["10", "9000004", "1.800,00"],                                  
      [{ value: "20", confidence: 0.9 }, "9000005", { value: "260,00" }], 
    ],
  }],
  warnings: [],
};
const wb2 = XLSX.read(generateExcel(mixDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Sem [object Object]", !hasObjectObject(wb2));
const g2 = XLSX.utils.sheet_to_json(wb2.Sheets["Itens"], { header: 1 });
check("Linha primitiva: Material 9000004", g2[1][1] === "9000004");
check("Linha mista: Item 20 (de objeto)", g2[2][0] === "20", String(g2[2][0]));
check("Linha mista: Material 9000005 (primitivo)", g2[2][1] === "9000005");
check("Linha mista: Preço 260,00 (de objeto)", g2[2][2] === "260,00", String(g2[2][2]));




console.log("\n═══ CASO 3: primitiva '9000004' == objeto {value:'9000004'} ═══");
const docPrim = { document_name:"a", generated_at:new Date().toISOString(), total_pages:1, fields:[], people:[],
  tables:[{ title:"Itens", page:1, headers:["Material"], rows:[["9000004"]] }], warnings:[] };
const docObj = { document_name:"a", generated_at:new Date().toISOString(), total_pages:1, fields:[], people:[],
  tables:[{ title:"Itens", page:1, headers:["Material"], rows:[[{ value:"9000004", confidence:0.9 }]] }], warnings:[] };
const wbPrim = XLSX.read(generateExcel(docPrim,{clientMode:true}).buffer,{type:"buffer"});
const wbObj  = XLSX.read(generateExcel(docObj,{clientMode:true}).buffer,{type:"buffer"});
const vPrim = XLSX.utils.sheet_to_json(wbPrim.Sheets[wbPrim.SheetNames[0]],{header:1})[1][0];
const vObj  = XLSX.utils.sheet_to_json(wbObj.Sheets[wbObj.SheetNames[0]],{header:1})[1][0];
check("Ambas viram 9000004", vPrim === "9000004" && vObj === "9000004", `prim=${vPrim} obj=${vObj}`);




console.log("\n═══ CASO 4: multi-página com células objeto ═══");
const mkPage = (pg) => ({
  title: "Itens", page: pg,
  headers: ["Item", "Material", "Data de remessa"],
  rows: [[{ value: `${pg}0`, confidence: 1 }, { value: `200${pg}714`, confidence: 1 }, { value: "07.07.2006", confidence: 1 }]],
});
const multiDoc = {
  document_name: "multi.png", generated_at: new Date().toISOString(), total_pages: 3,
  fields: [], people: [], tables: [mkPage(1), mkPage(2), mkPage(3)], warnings: [],
};
const wb4 = XLSX.read(generateExcel(multiDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Sem [object Object]", !hasObjectObject(wb4));
const g4 = XLSX.utils.sheet_to_json(wb4.Sheets["Itens"], { header: 1 });
check("3 linhas consolidadas", g4.length === 4, `tem ${g4.length}`);
check("Página coluna = 1,2,3", [g4[1].at(-1), g4[2].at(-1), g4[3].at(-1)].join(",") === "1,2,3");
check("Datas normalizadas em todas", g4.slice(1).every(r => r[2] === "07/07/2006"));




console.log("\n═══ CASO 5: cabeçalhos como objeto ═══");
const hdrObjDoc = {
  document_name: "h.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [], people: [],
  tables: [{
    title: "Itens", page: 1,
    headers: [{ value: "Item" }, { value: "Material" }],
    rows: [[{ value: "10" }, { value: "9000004" }]],
  }],
  warnings: [],
};
const wb5 = XLSX.read(generateExcel(hdrObjDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Sem [object Object] (header)", !hasObjectObject(wb5));
const g5 = XLSX.utils.sheet_to_json(wb5.Sheets["Itens"], { header: 1 });
check("Header = Item | Material", g5[0].slice(0, 2).join("|") === "Item|Material", g5[0].join("|"));




console.log("\n═══ CASO 6: regressão pessoas ═══");
const pplDoc = {
  document_name: "f.png", generated_at: new Date().toISOString(), total_pages: 1,
  fields: [], people: [
    { nome_completo: "PESSOA FICTICIA 034", telefone: "(11) 90000-0009", cidade: "CIDADE FICTICIA 003", data_nascimento: "04/04/2003", email_ou_instagram: "pessoa004@example.test", page: 1 },
  ],
  tables: [], warnings: [],
};
const wb6 = XLSX.read(generateExcel(pplDoc, { clientMode: true }).buffer, { type: "buffer" });
check("Aba = Pessoas", wb6.SheetNames[0] === "Pessoas");
check("Sem [object Object]", !hasObjectObject(wb6));

console.log(`\n══════════════════════════\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
