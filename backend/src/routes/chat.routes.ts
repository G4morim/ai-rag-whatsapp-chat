import { Router } from "express";
import { supabase } from "../supabase.js";
import { loadSettings } from "../lib/settings.js";
import { requestChatCompletion } from "../lib/openrouter.js";
import { retrieveContext } from "../lib/rag.js";

const router = Router();

type ConversationRow = {
  id: string;
  external_id: string | null;
  source: string;
};

async function getOrCreateConversation(externalId: string | null, source: string) {
  if (externalId) {
    const { data } = await supabase
      .from("conversations")
      .select("id,external_id,source")
      .eq("external_id", externalId)
      .eq("source", source)
      .maybeSingle();

    if (data) return data as ConversationRow;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ external_id: externalId, source })
    .select("id,external_id,source")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ConversationRow;
}

router.get("/history", async (req, res) => {
  const conversationId = req.query.conversationId as string | undefined;

  if (!conversationId) {
    return res.json([]);
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
});

router.post("/", async (req, res) => {
  const { message, conversationId, source = "test" } = req.body as {
    message?: string;
    conversationId?: string;
    source?: string;
  };

  if (!message) {
    return res.status(400).json({ error: "Mensagem obrigatoria." });
  }

  try {
    const settings = await loadSettings();
    const context = await retrieveContext(message);
    const conversation = await getOrCreateConversation(conversationId ?? null, source);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: message,
      source,
    });

    const systemPrompt = settings.SYSTEM_PROMPT ?? "";
    const systemMessage = context
      ? `${systemPrompt}\n\nContexto:\n${context}`
      : systemPrompt;

    const reply = await requestChatCompletion([
      { role: "system", content: systemMessage },
      { role: "user", content: message },
    ]);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
      source,
    });

    return res.json({ reply, conversationId: conversation.id });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
