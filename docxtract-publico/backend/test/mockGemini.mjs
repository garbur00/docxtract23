// Test-only provider response. No request is sent to a real AI service.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return originalFetch(input, options);
  }
  if (url.hostname !== "generativelanguage.googleapis.com" || url.searchParams.has("key")) {
    throw new Error("Unexpected provider request in offline fixture.");
  }
  if (options.headers?.["x-goog-api-key"] !== process.env.GEMINI_API_KEY) {
    throw new Error("Provider authentication must use a server-side header.");
  }
  if (String(options.body).includes("force-synthetic-provider-error")) {
    throw new Error(`Simulated failure: ${process.env.GEMINI_API_KEY}`);
  }
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    page: 1,
    document_type: "form",
    confidence_overall: 1,
    fields: [{ name: "Nome completo (1)", value: "Pessoa Sintetica Exemplo", confidence: 1 }],
    people: [], tables: [], warnings: [],
  }) }] } }] });
};
