// Loaded before each test: never use a developer's real AI credentials.
import { fileURLToPath } from "node:url";

for (const name of Object.keys(process.env)) {
  if (/API_KEY|ACCESS_PASSWORD|TOKEN|SECRET/i.test(name)) delete process.env[name];
}
process.env.NODE_ENV = "test";
process.env.ENABLE_ACCESS_PASSWORD = "false";
process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL("__no_credentials_for_tests__.env", import.meta.url));

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("External requests are disabled during tests. Mock the provider response instead.");
  }
  return originalFetch(input, options);
};
