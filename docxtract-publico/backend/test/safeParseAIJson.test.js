// Cenários e dados inteiramente sintéticos para testes automatizados.
import { safeParseAIJson } from "../src/utils/json.js";
import { parseAIResponse } from "../src/services/validationService.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};


{
  const r = safeParseAIJson(`{"people":[{"nome":"Pessoa Ficticia 034"}]}`);
  check("JSON válido → objeto", r.ok && r.data.people[0].nome === "Pessoa Ficticia 034");
  check("válido não marca repaired", r.ok && r.repaired === false);
}


{
  const r = safeParseAIJson("```json\n{ \"people\": [] }\n```");
  check("markdown removido", r.ok && Array.isArray(r.data.people));
}


{
  const r = safeParseAIJson(`{"a":1,"b":[1,2,3,],}`);
  check("trailing commas removidas", r.ok && r.data.b.length === 3 && r.data.a === 1);
}


{
  const r = safeParseAIJson(`{“nome”:“Pessoa Ficticia 065”}`);
  check("aspas curvas → retas", r.ok && r.data.nome === "Pessoa Ficticia 065");
}


{
  const r = safeParseAIJson(`{"people":[{"nome":"Pessoa Ficticia 034"},{"nome":"Pessoa Ficticia 059"}`);
  check("colchetes/chaves fechados", r.ok && r.data.people.length === 2);
}


{
  const r = safeParseAIJson(`Claro! Aqui:\n{"ok":true}\nEspero ter ajudado.`);
  check("texto extra removido", r.ok && r.data.ok === true);
}


{
  const r = safeParseAIJson(`{ // comentário\n "nome":"Pessoa Ficticia 034" /* fim */ }`);
  check("comentários removidos", r.ok && r.data.nome === "Pessoa Ficticia 034");
}


{
  const r = safeParseAIJson(`\uFEFF{"a":\u00A0"x"}\u200B`);
  check("caracteres invisíveis tratados", r.ok && r.data.a === "x");
}


{
  const r = safeParseAIJson(`{"people":[{"nome":"Pessoa Ficticia 034","tel":"119`);
  check("string truncada fechada", r.ok && r.data.people[0].nome === "Pessoa Ficticia 034");
}


{
  const r = safeParseAIJson("```json\n[{\"a\":1},{\"b\":2},]\n```");
  check("array raiz + trailing comma", r.ok && Array.isArray(r.data) && r.data.length === 2);
}


{
  const r = safeParseAIJson(`isso não é json de jeito nenhum`);
  check("lixo → ok:false", r.ok === false);
  check("erro tem mensagem", typeof r.error === "string" && r.error.length > 0);
  check("erro inclui snippet", typeof r.snippet === "string");
  check("não inventou data", r.data === undefined);
}


{
  const r = safeParseAIJson("   ");
  check("vazio → ok:false", r.ok === false);
}


{
  let code = null;
  try { parseAIResponse("não é json"); } catch (e) { code = e.code; }
  check("parseAIResponse lança INVALID_AI_JSON", code === "INVALID_AI_JSON", code);
}
{
  const data = parseAIResponse("```json\n{\"page\":1,\"fields\":[]}\n```");
  check("parseAIResponse recupera markdown", data.page === 1);
}


{
  const r = safeParseAIJson(`{"x":"a,b",}`);
  check("vírgula DENTRO de string preservada", r.ok && r.data.x === "a,b");
}

console.log("\n══════════════════════════");

{
  const r = safeParseAIJson(`{"people":[{"nome":"Pessoa Ficticia 034"}{"nome":"Pessoa Ficticia 059"}{"nome":"Pessoa Ficticia 067"}]}`);
  check("vírgula faltando entre objetos do array", r.ok && r.data.people.length === 3, JSON.stringify(r.data));
}

{
  const r = safeParseAIJson(`{"a":1 "b":2 "c":3}`);
  check("vírgula faltando entre membros", r.ok && r.data.a === 1 && r.data.c === 3);
}

{
  const r = safeParseAIJson(`{"x":["a" "b" "c"]}`);
  check("vírgula faltando entre strings", r.ok && r.data.x.length === 3);
}

{
  const r = safeParseAIJson(`{"nome":"Ficticia1\Ficticia2","ok":true}`);
  check("newline cru em string escapado", r.ok && r.data.nome === "Ficticia1\Ficticia2" && r.data.ok === true);
}

{
  const r = safeParseAIJson(`{"x":"a\tb"}`);
  check("tab cru em string escapado", r.ok && r.data.x === "a\tb");
}

{
  const r = safeParseAIJson(`{"people":[{"n":"A\nB"}{"n":"C"}]}`);
  check("vírgula faltando + newline cru", r.ok && r.data.people.length === 2 && r.data.people[0].n === "A\nB");
}

{
  const r = safeParseAIJson(`{"a": @@@ }`, { page: 2 });
  check("erro estruturado tem raw_error", r.ok === false && typeof r.raw_error === "string");
  check("erro estruturado tem context.page", r.ok === false && r.context && r.context.page === 2);
  check("erro estruturado tem snippet", r.ok === false && typeof r.snippet === "string" && r.snippet.length > 0);
}

{
  const valid = `{"a":1,"b":[1,2,3],"c":{"d":true,"e":null},"f":"x, y, z"}`;
  const r = safeParseAIJson(valid);
  check("JSON válido permanece idêntico", r.ok && r.data.f === "x, y, z" && r.data.b.length === 3 && r.repaired === false);
}


console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
