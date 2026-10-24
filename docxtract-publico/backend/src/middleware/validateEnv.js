// ─── Environment variable validation at startup ─────────────────────────────
// Catches misconfiguration BEFORE the server accepts traffic.
// Prints clear, actionable errors instead of failing on first request.

const REQUIRED_IN_PROD = ["ALLOWED_ORIGINS"];

export function validateEnv() {
  const env = process.env;
  const errors = [];
  const warnings = [];

  // Production-only requirements
  if (env.NODE_ENV === "production") {
    REQUIRED_IN_PROD.forEach(key => {
      if (!env[key]) {
        errors.push(`${key} é obrigatória em produção`);
      }
    });

    if (env.ALLOWED_ORIGINS === "http://localhost:5173" || env.ALLOWED_ORIGINS === "*") {
      errors.push(`ALLOWED_ORIGINS=${env.ALLOWED_ORIGINS} é inseguro em produção. Use o domínio real do frontend.`);
    }
  }

  // At least one AI provider must be configured
  const aiConfigured = {
    gemini: !!env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 10,
    claude: !!env.CLAUDE_API_KEY && env.CLAUDE_API_KEY.length > 10,
    openai: !!env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10,
  };
  const aiCount = Object.values(aiConfigured).filter(Boolean).length;

  if (aiCount === 0) {
    errors.push("Nenhuma chave de IA configurada. Defina ao menos uma: GEMINI_API_KEY, CLAUDE_API_KEY ou OPENAI_API_KEY");
  } else if (!aiConfigured.gemini) {
    warnings.push("GEMINI_API_KEY não configurada — extrator principal indisponível. Sistema operará em modo Claude/OpenAI Solo.");
  }

  // Sanity checks on values
  if (env.GEMINI_API_KEY && !env.GEMINI_API_KEY.startsWith("AIza")) {
    warnings.push("GEMINI_API_KEY parece estar em formato incorreto. Confira a configuração privada do servidor.");
  }
  if (env.CLAUDE_API_KEY && !env.CLAUDE_API_KEY.startsWith("sk-ant-")) {
    warnings.push("CLAUDE_API_KEY parece estar em formato incorreto. Confira a configuração privada do servidor.");
  }
  if (env.OPENAI_API_KEY && !env.OPENAI_API_KEY.startsWith("sk-")) {
    warnings.push("OPENAI_API_KEY parece estar em formato incorreto. Confira a configuração privada do servidor.");
  }

  // Port
  if (env.PORT && (isNaN(+env.PORT) || +env.PORT < 1 || +env.PORT > 65535)) {
    errors.push(`PORT inválida: ${env.PORT}`);
  }

  // Optional access password
  const passwordEnabled = String(env.ENABLE_ACCESS_PASSWORD || "").toLowerCase() === "true";
  if (passwordEnabled) {
    if (!env.ACCESS_PASSWORD) {
      errors.push("ENABLE_ACCESS_PASSWORD=true mas ACCESS_PASSWORD está vazia. Defina uma senha ou desabilite.");
    } else if (env.ACCESS_PASSWORD.length < 8) {
      warnings.push(`ACCESS_PASSWORD tem menos de 8 caracteres — use algo mais forte (mínimo recomendado: 12).`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    aiConfigured,
    accessPasswordEnabled: passwordEnabled,
    environment: env.NODE_ENV || "development",
  };
}

// ─── Report at startup (called once from server.js) ─────────────────────────
export function reportEnvValidation() {
  const result = validateEnv();

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   DocXtract — Validação de Ambiente   ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`Ambiente: ${result.environment}`);
  console.log(`IAs configuradas: Gemini=${result.aiConfigured.gemini ? "✓" : "✗"} · Claude=${result.aiConfigured.claude ? "✓" : "✗"} · OpenAI=${result.aiConfigured.openai ? "✓" : "✗"}`);
  console.log(`Senha de acesso: ${result.accessPasswordEnabled ? "✓ habilitada" : "✗ desabilitada (livre acesso)"}`);

  if (result.warnings.length > 0) {
    console.log("\n⚠️  Avisos:");
    result.warnings.forEach(w => console.log(`   • ${w}`));
  }

  if (result.errors.length > 0) {
    console.log("\n❌ Erros de configuração:");
    result.errors.forEach(e => console.log(`   • ${e}`));
    console.log("\nO servidor não pode iniciar. Corrija o .env e tente novamente.");
    process.exit(1);
  }

  console.log("\n✓ Configuração válida\n");
  return result;
}
