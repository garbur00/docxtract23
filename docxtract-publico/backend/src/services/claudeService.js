// ─── Claude (Anthropic) API service ──────────────────────────────────────────
// All calls to Anthropic happen here, server-side. API key never reaches the browser.

import { redactSecrets } from "../utils/redactSecrets.js";

const apiKey = process.env.CLAUDE_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

export function isClaudeConfigured() {
  return !!apiKey && apiKey.trim().length > 10;
}

export async function callClaude(base64, mediaType, prompt) {
  if (!isClaudeConfigured()) {
    throw new Error("Servidor: CLAUDE_API_KEY não configurada");
  }

  const mt = base64 ? (mediaType === "image/jpg" ? "image/jpeg" : mediaType) : null;
  const content = base64
    ? [
        { type: "image", source: { type: "base64", media_type: mt, data: base64 } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Timeout do Claude (90s)");
    throw new Error(`Falha de rede ao chamar Claude: ${redactSecrets(err.message)}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    let errMsg = res.statusText;
    try { const e = await res.json(); errMsg = e.error?.message || errMsg; } catch {}

    if (res.status === 401) throw new Error("Claude: chave inválida.");
    if (res.status === 429) throw new Error("Claude: rate limit. Aguarde alguns segundos.");
    if (res.status >= 500) throw new Error(`Claude indisponível (${res.status}).`);
    throw new Error(`Claude API ${res.status}: ${redactSecrets(errMsg)}`);
  }

  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text;
  if (!text) throw new Error("Claude retornou resposta sem texto");
  return text;
}
