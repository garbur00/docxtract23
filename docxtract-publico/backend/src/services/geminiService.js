// ─── Gemini API service ──────────────────────────────────────────────────────
// All calls to Google Gemini happen here, server-side, with the API key
// protected via environment variable (never exposed to the browser).

import { redactSecrets } from "../utils/redactSecrets.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const apiKey = process.env.GEMINI_API_KEY;

export function isGeminiConfigured() {
  return !!apiKey && apiKey.trim().length > 10;
}

export async function callGemini(model, base64, mediaType, prompt) {
  if (!isGeminiConfigured()) {
    throw new Error("Servidor: GEMINI_API_KEY não configurada");
  }

  const mt = mediaType === "image/jpg" ? "image/jpeg" : mediaType;
  const url = `${API_BASE}/${model}:generateContent`;

  // Modo texto puro (textOnly): sem base64 → não enviar inline_data (senão a
  // API responde 400 "Unsupported MIME type"). Suporta PDF digital / DOCX.
  const parts = [];
  if (base64) parts.push({ inline_data: { mime_type: mt, data: base64 } });
  parts.push({ text: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          // 8000 truncava páginas densas (várias fichas → resposta cortada,
          // perdendo pacientes inteiros). 2.5-flash suporta bem mais.
          maxOutputTokens: 32000,
        },
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Timeout do Gemini (90s)");
    throw new Error(`Falha de rede ao chamar Gemini: ${redactSecrets(err.message)}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    let errMsg = `${res.status}`;
    let errCode = "";
    try {
      const e = await res.json();
      errMsg = e.error?.message || errMsg;
      errCode = e.error?.status || "";
    } catch {}

    if (res.status === 400 && /API key not valid|api_key/i.test(errMsg)) {
      throw new Error("Gemini: chave inválida. Verifique a variável GEMINI_API_KEY do servidor.");
    }
    if (res.status === 403) {
      throw new Error("Gemini: acesso negado para esta chave/modelo.");
    }
    if (res.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(errMsg + errCode)) {
      throw new Error("Gemini: cota excedida. Aguarde alguns minutos ou ative billing.");
    }
    if (res.status === 404 || /not found|not supported/i.test(errMsg)) {
      if (/1\.5/.test(model)) {
        throw new Error("Gemini 1.5 foi descontinuado em set/2025. Use gemini-2.5-flash.");
      }
      throw new Error(`Modelo Gemini "${model}" não encontrado.`);
    }
    throw new Error(`Gemini API ${res.status}: ${redactSecrets(errMsg)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
    if (finishReason === "SAFETY") {
      throw new Error("Gemini bloqueou a resposta por filtros de segurança.");
    }
    if (finishReason === "MAX_TOKENS") {
      throw new Error("Resposta do Gemini foi cortada (limite de tokens).");
    }
    throw new Error(`Gemini retornou resposta vazia (${finishReason}).`);
  }

  return text;
}

// Test if a Gemini model is accessible with the current key
export async function testGeminiModel(model) {
  if (!isGeminiConfigured()) {
    return { ok: false, error: "GEMINI_API_KEY não configurada no servidor" };
  }
  const url = `${API_BASE}/${model}`;
  try {
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey.trim() } });
    if (res.ok) {
      const d = await res.json();
      return { ok: true, model: d.displayName || model };
    }
    const e = await res.json().catch(() => ({}));
    const msg = e.error?.message || `${res.status}`;
    return { ok: false, status: res.status, error: redactSecrets(msg) };
  } catch (err) {
    return { ok: false, error: redactSecrets(err.message) };
  }
}
