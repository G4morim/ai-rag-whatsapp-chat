import formidable from "formidable";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { supabase } from "./lib/supabase.js";
import { loadSettings, maskApiKey } from "./lib/settings.js";
import { getOptionalEnv } from "./lib/env.js";
import { storeDocumentChunks, retrieveContext } from "./lib/rag.js";
import { requestChatCompletion } from "./lib/openrouter.js";

const SUPPORTED_TYPES = new Set(["application/pdf", "text/plain", "text/markdown"]);

export const config = {
  api: {
    bodyParser: false,
  },
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sanitizeFilename(value) {
  const normalized = value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
  const withoutSeparators = normalized.replace(/[\\/]/g, " ");
  const cleaned = withoutSeparators
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    const extension = normalized.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase();
    return extension ? `document.${extension}` : "document";
  }

  return cleaned;
}

function isSupportedMime(mime) {
  if (SUPPORTED_TYPES.has(mime)) return true;
  return mime.endsWith("/markdown") || mime.endsWith("/x-markdown");
}

async function extractText(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const parsed = await pdf(buffer);
    return parsed.text;
  }

  return buffer.toString("utf8");
}

function parseForm(req) {
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) return reject(error);
      resolve({ fields, files });
    });
  });
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

async function handleSettings(req, res) {
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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

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

async function handleDocumentsList(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id,filename,mime_type,size,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data ?? []);
}

async function handleDocumentsUpload(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  try {
    const { files } = await parseForm(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: "Arquivo nao enviado." });
    }

    const mimeType = file.mimetype ?? "";
    if (!isSupportedMime(mimeType)) {
      return res.status(400).json({ error: "Tipo de arquivo nao suportado." });
    }

    const buffer = await readFile(file.filepath);
    const bucket = getOptionalEnv("SUPABASE_DOCS_BUCKET", "documents");
    const documentId = randomUUID();
    const rawFilename = file.originalFilename ?? "document";
    const filename = sanitizeFilename(rawFilename);
    const storagePath = `${documentId}/${filename}`;

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

    if (storageError) {
      return res.status(500).json({ error: storageError.message });
    }

    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      filename,
      mime_type: mimeType,
      size: file.size,
      storage_path: storagePath,
    });

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    const text = await extractText(buffer, mimeType);
    await storeDocumentChunks(documentId, text);

    return res.status(200).json({ id: documentId, filename });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleDocumentDelete(req, res, id) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const bucket = getOptionalEnv("SUPABASE_DOCS_BUCKET", "documents");

  const { data: doc, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (error) {
    return res.status(404).json({ error: "Documento nao encontrado." });
  }

  if (doc?.storage_path) {
    await supabase.storage.from(bucket).remove([doc.storage_path]);
  }

  await supabase.from("document_chunks").delete().eq("document_id", id);
  await supabase.from("documents").delete().eq("id", id);

  return res.status(200).json({ success: true });
}

async function handleChatHistory(req, res, url) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return res.status(200).json([]);
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data ?? []);
}

async function handleChat(req, res) {
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

async function handleWhatsappWebhook(req, res) {
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

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/^\/api\/?/, "");
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return res.status(404).json({ error: "Endpoint nao encontrado." });
  }

  const [root, ...rest] = segments;

  if (root === "settings" && rest.length === 0) {
    return handleSettings(req, res);
  }

  if (root === "documents") {
    if (rest.length === 0) {
      return handleDocumentsList(req, res);
    }

    if (rest[0] === "upload" && rest.length === 1) {
      return handleDocumentsUpload(req, res);
    }

    if (rest.length === 1) {
      return handleDocumentDelete(req, res, rest[0]);
    }
  }

  if (root === "chat") {
    if (rest[0] === "history" && rest.length === 1) {
      return handleChatHistory(req, res, url);
    }

    if (rest.length === 0) {
      return handleChat(req, res);
    }
  }

  if (root === "whatsapp" && rest[0] === "webhook" && rest.length === 1) {
    return handleWhatsappWebhook(req, res);
  }

  return res.status(404).json({ error: "Endpoint nao encontrado." });
}
