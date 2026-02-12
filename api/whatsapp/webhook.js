import { getOptionalEnv } from "../lib/env.js";
import { loadSettings } from "../lib/settings.js";
import { requestChatCompletion } from "../lib/openrouter.js";
import { retrieveContext } from "../lib/rag.js";
import { supabase } from "../lib/supabase.js";

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

function resolveIncoming(body) {
  const from = body?.from ?? body?.sender ?? body?.data?.from ?? body?.data?.sender;
  const text =
    body?.message?.text ??
    body?.data?.message?.text ??
    body?.text ??
    body?.message;

  if (!from || !text) return null;
  return { from, text };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const body = await readJson(req);
  const incoming = resolveIncoming(body);

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

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
