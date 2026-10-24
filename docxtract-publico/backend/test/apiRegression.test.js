import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import statsRouter from "../src/routes/stats.js";
import { auditLog } from "../src/utils/auditLog.js";
import { safeEqual } from "../src/middleware/requireAccess.js";

assert.equal(safeEqual("sintético-✓", "sintético-✓"), true);
assert.equal(safeEqual("sintético-✓", "sintetico"), false);
assert.equal(safeEqual("x", "xx"), false);

const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));

const password = `synthetic-password-${randomBytes(12).toString("hex")}`;
const apiKey = `synthetic-api-${randomBytes(12).toString("hex")}`;
const child = spawn(process.execPath, ["--import", new URL("mockGemini.mjs", import.meta.url).href, "src/server.js"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, PORT: String(port), NODE_ENV: "test", ENABLE_ACCESS_PASSWORD: "true",
    ACCESS_PASSWORD: password, GEMINI_API_KEY: apiKey, CLAUDE_API_KEY: "", OPENAI_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let startupLog = "";
child.stdout.on("data", chunk => { startupLog += chunk; });
child.stderr.on("data", chunk => { startupLog += chunk; });
const base = `http://127.0.0.1:${port}`;
let statsServer;

const request = (path, body, extraHeaders = {}) => fetch(base + path, {
  method: body === undefined ? "GET" : "POST",
  headers: { "Content-Type": "application/json", "X-Access-Password": password, ...extraHeaders },
  body: body === undefined ? undefined : JSON.stringify(body),
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Fixture server failed to start.");
    try { if ((await request("/health")).ok) { ready = true; break; } } catch {}
    await delay(50);
  }
  assert.ok(ready, "The actual API server must start with synthetic configuration.");
  const status = await request("/api/access/status");
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("cache-control"), "no-store");

  const extract = async name => {
    const response = await request("/api/documents/extract", {
      document_name: name, text_content: "Synthetic document for an offline test.",
      options: { extractor: "gemini", reviewer: false },
    }, { "X-Request-ID": "synthetic-identical-request" });
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await extract("synthetic-first");
  const second = await extract("synthetic-second");
  assert.notEqual(first.document_id, second.document_id);
  assert.match(first.document_id, /^doc_[0-9a-f-]{36}$/i);
  assert.equal((await (await request(`/api/documents/${first.document_id}`)).json()).document.document_name, "synthetic-first");
  assert.equal((await (await request(`/api/documents/${second.document_id}`)).json()).document.document_name, "synthetic-second");

  const repaired = await request("/api/process/fix-json", { rawText: "force-synthetic-provider-error" });
  assert.equal(repaired.status, 502);
  const repairedText = await repaired.text();
  assert.ok(!repairedText.includes(apiKey), "Provider failures must not expose credentials.");
  assert.ok(repairedText.includes("[REDACTED]"));

  for (let index = 0; index < 3; index++) {
    const response = await request("/api/access/login", { password });
    assert.equal(response.status, 200);
    await response.json();
  }
  for (let index = 0; index < 10; index++) {
    const response = await request("/api/access/login", { password: "synthetic-wrong-password" });
    assert.equal(response.status, 401);
    await response.json();
  }
  const blocked = await request("/api/access/login", { password: "synthetic-wrong-password" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  for (let index = 0; index < 250; index++) auditLog.log({ type: "synthetic-event", index });
  const app = express();
  app.use("/stats", statsRouter);
  statsServer = app.listen(0, "127.0.0.1");
  await once(statsServer, "listening");
  const statsBase = `http://127.0.0.1:${statsServer.address().port}`;
  for (const [limit, expected] of [["-1", 1], ["999", 200], ["0", 50], ["invalid", 50]]) {
    const response = await fetch(`${statsBase}/stats/recent?limit=${limit}`);
    const data = await response.json();
    assert.equal(data.entries.length, expected);
  }
  assert.ok(!startupLog.includes(apiKey), "Server logs must not print synthetic credentials.");
  console.log("✓ Actual API: isolated document IDs, no-store, login limits, redacted errors, and bounded statistics.");
} finally {
  if (statsServer) await new Promise(resolve => statsServer.close(resolve));
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
