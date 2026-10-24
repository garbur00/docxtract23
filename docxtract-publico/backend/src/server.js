import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import "dotenv/config";

import processRouter from "./routes/process.js";
import documentsRouter from "./routes/documents.js";
import statsRouter from "./routes/stats.js";
import testKeyRouter from "./routes/testKey.js";
import healthRouter from "./routes/health.js";
import accessRouter from "./routes/access.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter, heavyLimiter } from "./middleware/rateLimit.js";
import { requireAccess } from "./middleware/requireAccess.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { reportEnvValidation } from "./middleware/validateEnv.js";
import { redactSecrets } from "./utils/redactSecrets.js";

// ─── Validate environment FIRST — exit early on misconfiguration ─────────────
const envResult = reportEnvValidation();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());

// ─── Request ID (must come before logging) ───────────────────────────────────
app.use(requestIdMiddleware);

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[CORS] Blocked origin: ${origin}`);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Request-ID", "X-Access-Password"],
  exposedHeaders: ["X-Request-ID"],
  credentials: false,
}));

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ─── Request logging with request ID ─────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(redactSecrets(`[${new Date().toISOString()}] [${req.requestId}] ${req.method} ${req.path}`));
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);

// Extraction results and access responses must not be kept by HTTP caches.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Access route is PUBLIC (frontend needs status check before login).
app.use("/api/access", accessRouter);

// Everything else under /api is rate-limited + requires access password (if enabled).
app.use("/api", apiLimiter);
app.use("/api", requireAccess);

// AI-calling endpoints get the heavier limiter on top of the global one.
app.use("/api/process", heavyLimiter, processRouter);
app.use("/api/documents/extract", heavyLimiter);
app.use("/api/documents", documentsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/test-key", testKeyRouter);

app.use((req, res) => {
  res.status(404).json({
    error: `Endpoint não encontrado: ${req.method} ${req.path}`,
    request_id: req.requestId,
  });
});

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════╗`);
  console.log(`║  DocXtract API rodando na porta ${PORT}  ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(`Ambiente: ${envResult.environment}`);
  console.log(`Origens permitidas: ${allowedOrigins.join(", ")}`);
  console.log(`Validação de schema: ✓ habilitada (Zod)`);
});

process.on("SIGTERM", () => { console.log("SIGTERM received, shutting down"); process.exit(0); });
process.on("SIGINT",  () => { console.log("SIGINT received, shutting down");  process.exit(0); });
