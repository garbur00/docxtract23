// Cenários e dados inteiramente sintéticos para testes automatizados.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "../../frontend/src/DocXtract.jsx"), "utf8");

const iStart = src.indexOf("const CONFIG = {");
const iEnd = src.indexOf("function SettingsPanel");
if (iStart < 0 || iEnd < 0) {
  throw new Error("Fixture: não encontrei os limites CONFIG…SettingsPanel em DocXtract.jsx");
}
const helpersCode = src.slice(iStart, iEnd);




const api = new Function(
  "XLSX",
  helpersCode +
    "\nreturn { consolidatePages, pivotNumberedFieldsToPeople, clientIsEmptyPerson, clientBuildPeopleTable, clientHasRoleSection, countRecordsIn, perIndexValuedCounts, hasLopsidedRecord, computeSymmetricGaps, markSymmetricGaps, expandFamilyToRows };"
)(XLSX);

export const consolidatePages = api.consolidatePages;
export const pivotNumberedFieldsToPeople = api.pivotNumberedFieldsToPeople;
export const clientIsEmptyPerson = api.clientIsEmptyPerson;
export const clientBuildPeopleTable = api.clientBuildPeopleTable;
export const clientHasRoleSection = api.clientHasRoleSection;
export const countRecordsIn = api.countRecordsIn;
export const perIndexValuedCounts = api.perIndexValuedCounts;
export const hasLopsidedRecord = api.hasLopsidedRecord;
export const computeSymmetricGaps = api.computeSymmetricGaps;
export const markSymmetricGaps = api.markSymmetricGaps;
export const expandFamilyToRows = api.expandFamilyToRows;
