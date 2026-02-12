import { Router } from "express";
import { getOptionalEnv } from "../lib/env.js";
import { loadSettings } from "../lib/settings.js";
import { requestChatCompletion } from "../lib/openrouter.js";
import { retrieveContext } from "../lib/rag.js";
import { supabase } from "../supabase.js";

const router = Router();

async function getOrCreateConversation(externalId: string, source: string) {
  const { data } = await supabase
    .from("conversations")
    .select("id,external_id,source")
    .eq("external_id", externalId)
    .eq("source", source)
    .maybeSingle();

  if (data) return data;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ external_id: externalId, source })
    .select("id,external_id,source")
    .single();

  if (error) throw new Error(error.message);
  return created;
}

function resolveIncoming(body: any): { from: string; text: string } | null {
  const from = body?.from ?? body?.sender ?? body?.data?.from ?? body?.data?.sender;
  const text =
    body?.message?.text ??
    body?.data?.message?.text ??
    body?.text ??
    body?.message;

  if (!from || !text) return null;
  return { from, text };
}

router.post("/webhook", async (req, res) => {
  const incoming = resolveIncoming(req.body);

  if (!incoming) {
    return res.status(400).json({ error: "Payload de webhook invalido." });
  }

  try {
    const settings = await loadSettings();
    const context = await retrieveContext(incoming.text);
    const conversation = await getOrCreateConversation(incoming.from, "whatsapp");

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: incoming.text,
      source: "whatsapp",
    });

    const systemPrompt = settings.SYSTEM_PROMPT ?? "";
    const systemMessage = context
      ? `${systemPrompt}\n\nContexto:\n${context}`
      : systemPrompt;

    const reply = await requestChatCompletion([
      { role: "system", content: systemMessage },
      { role: "user", content: incoming.text },
    ]);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
      source: "whatsapp",
    });

    const baseUrl = getOptionalEnv("EVOLUTION_API_URL", "");
    const apiKey = getOptionalEnv("EVOLUTION_API_KEY", "");

    if (baseUrl) {
      await fetch(`${baseUrl}/message/sendText`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: incoming.from, text: reply }),
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
