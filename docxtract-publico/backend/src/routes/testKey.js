import express from "express";
import { testGeminiModel, isGeminiConfigured } from "../services/geminiService.js";
import { isClaudeConfigured } from "../services/claudeService.js";
import { isOpenAIConfigured } from "../services/openaiService.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  const result = {
    gemini: { configured: isGeminiConfigured(), reachable: null, error: null },
    claude: { configured: isClaudeConfigured(), reachable: null, error: null },
    openai: { configured: isOpenAIConfigured(), reachable: null, error: null },
  };

  if (isGeminiConfigured()) {
    const test = await testGeminiModel(process.env.GEMINI_DEFAULT_MODEL || "gemini-2.5-flash");
    result.gemini.reachable = test.ok;
    if (!test.ok) result.gemini.error = test.error;
  }
  if (isClaudeConfigured()) result.claude.reachable = true;
  if (isOpenAIConfigured()) result.openai.reachable = true;

  res.json(result);
});

export default router;
