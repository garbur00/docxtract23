// Cenários e dados inteiramente sintéticos para testes automatizados.
import express from "express";
import { requireAccess, safeEqual } from "../src/middleware/requireAccess.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import processRouter from "../src/routes/process.js";

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "✓" : "✗") + " " + name + (cond ? "" : ` — ${detail ?? ""}`));
  cond ? pass++ : fail++;
};


function buildApp() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use((req, _res, next) => { req.requestId = "test-req"; next(); });
  app.use("/api", requireAccess);
  app.use("/api/process", processRouter);
  app.get("/boom", () => { const e = new Error("segredo interno: stack"); e.status = 500; throw e; });
  app.use(errorHandler);
  return app;
}
function listen(app) {
  return new Promise(resolve => {
    const srv = app.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}
const json = (port, path, body, headers = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

const ENV_BAK = { EN: process.env.ENABLE_ACCESS_PASSWORD, PW: process.env.ACCESS_PASSWORD, NE: process.env.NODE_ENV };


console.log("═══ 1: safeEqual (comparação em tempo constante) ═══");
{
  check("igual → true", safeEqual("senha-123", "senha-123") === true);
  check("diferente → false", safeEqual("senha-123", "senha-124") === false);
  check("tamanhos diferentes → false", safeEqual("abc", "abcd") === false);
  check("vazios → true", safeEqual("", "") === true);
}


console.log("\n═══ 2: senha de acesso (middleware) ═══");
{
  process.env.ENABLE_ACCESS_PASSWORD = "true";
  process.env.ACCESS_PASSWORD = "super-secreta-12";
  const { srv, port } = await listen(buildApp());

  let r = await json(port, "/api/process", { provider: "gemini", prompt: "x", textOnly: true });
  check("sem senha → 401", r.status === 401, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", textOnly: true }, { "X-Access-Password": "errada" });
  check("senha errada → 401", r.status === 401, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", textOnly: true }, { "X-Access-Password": "super-secreta-12" });
  check("senha certa → passa do middleware (≠401)", r.status !== 401, `${r.status}`);

  process.env.ENABLE_ACCESS_PASSWORD = "false";
  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", textOnly: true });
  check("desabilitada → passa sem senha (≠401)", r.status !== 401, `${r.status}`);

  srv.close();
}


console.log("\n═══ 3: validação de upload no backend ═══");
{
  process.env.ENABLE_ACCESS_PASSWORD = "false";
  const { srv, port } = await listen(buildApp());

  let r = await json(port, "/api/process", { prompt: "x" });
  check("sem provider → 400", r.status === 400, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", base64: "QUJD", mediaType: "application/x-msdownload" });
  check("MIME perigoso (.exe) → 415", r.status === 415, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", base64: "QUJD", mediaType: "text/html" });
  check("MIME não permitido (html) → 415", r.status === 415, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", base64: "QUJD" });
  check("base64 sem mediaType → 400 (bypass fechado)", r.status === 400, `${r.status}`);

  r = await json(port, "/api/process", { provider: "gemini", prompt: "x", base64: "A".repeat(26 * 1024 * 1024), mediaType: "image/jpeg" });
  check("base64 > 25MB → 413", r.status === 413, `${r.status}`);

  r = await json(port, "/api/process", { provider: "hacker", prompt: "x", textOnly: true });
  check("provider inválido → 400", r.status === 400, `${r.status}`);

  srv.close();
}


console.log("\n═══ 4: erro em produção sem stack trace ═══");
{
  process.env.NODE_ENV = "production";
  const { srv, port } = await listen(buildApp());
  const r = await fetch(`http://127.0.0.1:${port}/boom`);
  const body = await r.json();
  check("status 500", r.status === 500, `${r.status}`);
  check("mensagem genérica (sem detalhes internos)", body.error === "Erro interno do servidor", body.error);
  check("sem campo stack", body.stack === undefined);
  check("request_id presente p/ debug", typeof body.request_id === "string");
  srv.close();
  process.env.NODE_ENV = ENV_BAK.NE || "";
}


process.env.ENABLE_ACCESS_PASSWORD = ENV_BAK.EN || "";
process.env.ACCESS_PASSWORD = ENV_BAK.PW || "";

console.log("\n══════════════════════════");
console.log(`${pass} passou, ${fail} falhou`);
process.exit(fail ? 1 : 0);
