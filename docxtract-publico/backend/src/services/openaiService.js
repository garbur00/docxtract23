// ─── OpenAI API service ──────────────────────────────────────────────────────
// Used as alternative reviewer when Claude not configured. API key stays server-side.

import { redactSecrets } from "../utils/redactSecrets.js";

const apiKey = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function isOpenAIConfigured() {
  return !!apiKey && apiKey.trim().length > 10;
}

export async function callOpenAI(base64, mediaType, prompt, model = DEFAULT_MODEL) {
  if (!isOpenAIConfigured()) {
    throw new Error("Servidor: OPENAI_API_KEY não configurada");
  }

  const mt = base64 ? (mediaType === "image/jpg" ? "image/jpeg" : mediaType) : null;

  // OpenAI vision uses data URI format
  const content = base64
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mt};base64,${base64}` } },
      ]
    : prompt;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        temperature: 0.1,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Timeout do OpenAI (90s)");
    throw new Error(`Falha de rede ao chamar OpenAI: ${redactSecrets(err.message)}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    let errMsg = res.statusText;
    let errCode = "";
    try {
      const e = await res.json();
      errMsg = e.error?.message || errMsg;
      errCode = e.error?.code || "";
    } catch {}

    if (res.status === 401) throw new Error("OpenAI: chave inválida.");
    if (res.status === 429) {
      if (/insufficient_quota|billing/i.test(errMsg + errCode)) {
        throw new Error("OpenAI: créditos esgotados. Adicione billing em platform.openai.com.");
      }
      throw new Error("OpenAI: rate limit. Aguarde alguns segundos.");
    }
    if (res.status === 404) throw new Error(`Modelo OpenAI "${model}" não encontrado.`);
    if (res.status >= 500) throw new Error(`OpenAI indisponível (${res.status}).`);
    throw new Error(`OpenAI API ${res.status}: ${redactSecrets(errMsg)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI retornou resposta sem texto");
  return text;
}
