import { loadSettings, maskApiKey } from "./lib/settings.js";
import { supabase } from "./lib/supabase.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const settings = await loadSettings();
      return res.status(200).json({
        ...settings,
        OPENROUTER_API_KEY: maskApiKey(settings.OPENROUTER_API_KEY),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readJson(req);
      const {
        OPENROUTER_API_KEY,
        OPENROUTER_MODEL,
        OPENROUTER_EMBEDDINGS_MODEL,
        SYSTEM_PROMPT,
      } = body;

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

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Metodo nao permitido." });
}
