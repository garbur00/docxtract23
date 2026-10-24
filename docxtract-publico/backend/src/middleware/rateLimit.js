import rateLimit from "express-rate-limit";

// Login is mounted before /api's global limiter, so protect failed attempts here.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global limit for /api/* — broad protection
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Muitas requisições. Aguarde alguns segundos e tente novamente." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Heavy limit for AI-calling endpoints (process + documents/extract).
// Each call consumes provider quota and may incur charges, so cap it per IP.
// PERF: o frontend agora processa 3 páginas em paralelo (2 chamadas de IA por
// página no pior caso: extração + revisão). 40/min comporta esse fluxo legítimo
// com folga e continua bloqueando abuso. IMPORTANTE: um 429 deste limiter é
// classificado pelo frontend como "quota" e interrompe o documento inteiro —
// não reduzir este valor sem reduzir PAGE_CONCURRENCY no DocXtract.jsx.
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: "Limite de processamento atingido. Aguarde 1 minuto e tente novamente." },
  standardHeaders: true,
  legacyHeaders: false,
});
