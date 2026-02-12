import { supabase } from "../lib/supabase.js";
import { loadSettings } from "../lib/settings.js";
import { requestChatCompletion } from "../lib/openrouter.js";
import { retrieveContext } from "../lib/rag.js";
import { withCors } from "../lib/cors.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function getOrCreateConversation(externalId, source) {
  if (externalId) {
    const { data } = await supabase
      .from("conversations")
      .select("id,external_id,source")
      .eq("external_id", externalId)
      .eq("source", source)
      .maybeSingle();

    if (data) return data;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ external_id: externalId, source })
    .select("id,external_id,source")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export default withCors(async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  try {
    const body = await readJson(req);
    const { message, conversationId, source = "test" } = body;

    if (!message) {
      return res.status(400).json({ error: "Mensagem obrigatoria." });
    }

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

    return res.status(200).json({ reply, conversationId: conversation.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
