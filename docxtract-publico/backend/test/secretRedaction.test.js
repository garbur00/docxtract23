import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { redactSecrets } from "../src/utils/redactSecrets.js";
import { validateEnv } from "../src/middleware/validateEnv.js";

// Only ephemeral, synthetic values are created here. No provider is contacted.
const dummy = (label) => `synthetic-${label}-${randomBytes(16).toString("hex")}`;
const apiKey = dummy("api");
const password = dummy("password");
const envNames = [
  "REDACTION_TEST_API_KEY", "REDACTION_TEST_PASSWORD", "NODE_ENV",
  "GEMINI_API_KEY", "CLAUDE_API_KEY", "OPENAI_API_KEY", "PORT",
  "ENABLE_ACCESS_PASSWORD", "ACCESS_PASSWORD",
];
const saved = new Map(envNames.map(name => [name, process.env[name]]));

try {
  process.env.REDACTION_TEST_API_KEY = apiKey;
  process.env.REDACTION_TEST_PASSWORD = password;

  const redacted = redactSecrets(`api=${apiKey}; password=${password}; again=${apiKey}`);
  assert.equal(redacted, "api=[REDACTED]; password=[REDACTED]; again=[REDACTED]");
  assert.equal(
    redactSecrets("https://example.test/extract?key=synthetic-query-secret&format=json"),
    "https://example.test/extract?key=[REDACTED]&format=json",
  );
  assert.equal(
    redactSecrets("https://example.test/?format=json&API_KEY=synthetic-other&token=synthetic-token"),
    "https://example.test/?format=json&API_KEY=[REDACTED]&token=[REDACTED]",
  );

  const common = "Extraction completed. Three synthetic pages are ready for review.";
  assert.equal(redactSecrets(common), common);
  assert.equal(redactSecrets(null), "");

  process.env.NODE_ENV = "test";
  delete process.env.PORT;
  process.env.ENABLE_ACCESS_PASSWORD = "false";
  const malformed = {
    GEMINI_API_KEY: dummy("malformed-gemini"),
    CLAUDE_API_KEY: dummy("malformed-claude"),
    OPENAI_API_KEY: dummy("malformed-openai"),
  };
  Object.assign(process.env, malformed);

  const result = validateEnv();
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 3);
  for (const [name, secret] of Object.entries(malformed)) {
    assert.ok(result.warnings.some(warning => warning.includes(name) && warning.includes("formato incorreto")));
    assert.ok(result.warnings.every(warning => !warning.includes(secret)));
    assert.ok(result.errors.every(error => !error.includes(secret)));
  }
  console.log("✓ Secret redaction and environment warnings preserve no synthetic credentials.");
} finally {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
