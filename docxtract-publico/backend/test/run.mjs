import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const testDirectory = new URL("./", import.meta.url);
const backendDirectory = fileURLToPath(new URL("../", import.meta.url));
const preload = new URL("offline.mjs", testDirectory).href;
const files = readdirSync(testDirectory).filter(name => name.endsWith(".test.js")).sort();
if (files.length === 0) throw new Error("No test files found.");

const env = { ...process.env, NODE_ENV: "test", ENABLE_ACCESS_PASSWORD: "false" };
for (const name of Object.keys(env)) {
  if (/API_KEY|ACCESS_PASSWORD|TOKEN|SECRET|DOTENV_CONFIG/i.test(name)) delete env[name];
}

let failed = 0;
for (const name of files) {
  console.log(`\n--- ${name} ---`);
  const result = spawnSync(process.execPath, ["--import", preload, fileURLToPath(new URL(name, testDirectory))], {
    cwd: backendDirectory,
    env,
    stdio: "inherit",
    timeout: 60_000,
    windowsHide: true,
  });
  if (result.error || result.signal || result.status !== 0) {
    failed++;
    console.error(`${name} failed${result.error?.code ? ` (${result.error.code})` : ""}.`);
  }
}

console.log(`\nTest files: ${files.length - failed} passed, ${failed} failed, ${files.length} total.`);
process.exitCode = failed ? 1 : 0;
