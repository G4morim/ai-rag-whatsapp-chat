import { Router } from "express";
import { supabase } from "../supabase.js";
import { loadSettings, maskApiKey } from "../lib/settings.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await loadSettings();

    return res.json({
      ...settings,
      OPENROUTER_API_KEY: maskApiKey(settings.OPENROUTER_API_KEY),
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/", async (req, res) => {
  const {
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    OPENROUTER_EMBEDDINGS_MODEL,
    SYSTEM_PROMPT,
  } = req.body;

  if (!OPENROUTER_API_KEY || !SYSTEM_PROMPT) {
    return res.status(400).json({
      error: "OPENROUTER_API_KEY e SYSTEM_PROMPT sao obrigatorios.",
    });
  }

  const entries = [
    { key: "OPENROUTER_API_KEY", value: OPENROUTER_API_KEY },
    { key: "OPENROUTER_MODEL", value: OPENROUTER_MODEL },
    { key: "OPENROUTER_EMBEDDINGS_MODEL", value: OPENROUTER_EMBEDDINGS_MODEL },
    { key: "SYSTEM_PROMPT", value: SYSTEM_PROMPT },
  ];

  for (const entry of entries) {
    if (!entry.value) continue;

    const { error } = await supabase
      .from("settings")
      .upsert(entry, { onConflict: "key" });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.json({ success: true });
});

export default router;