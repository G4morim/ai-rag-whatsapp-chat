import { supabase } from "./supabase.js";
import { getOptionalEnv } from "./env.js";
import { loadSettings } from "./settings.js";

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 120;

export function chunkText(text) {
  const size = Number(process.env.RAG_CHUNK_SIZE ?? DEFAULT_CHUNK_SIZE);
  const overlap = Number(process.env.RAG_CHUNK_OVERLAP ?? DEFAULT_OVERLAP);
  if (text.length <= size) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) start = 0;
  }

  return chunks;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let i = 0; i < a.length; i += 1) {
    const aValue = a[i];
    const bValue = b[i];
    if (aValue === undefined || bValue === undefined) {
      break;
    }
    dot += aValue * bValue;
    aNorm += aValue * aValue;
    bNorm += bValue * bValue;
  }

  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

async function createEmbedding(input) {
  const settings = await loadSettings();
  const apiKey = settings.OPENROUTER_API_KEY;
  const model =
    settings.OPENROUTER_EMBEDDINGS_MODEL ??
    process.env.OPENROUTER_EMBEDDINGS_MODEL ??
    "text-embedding-3-small";
  const baseUrl = getOptionalEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");

  if (!apiKey || !model) {
    throw new Error("Configuracao de embeddings ausente.");
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao gerar embedding: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;

  if (!embedding) {
    throw new Error("Resposta de embedding invalida.");
  }

  return embedding;
}

export async function storeDocumentChunks(documentId, text) {
  const chunks = chunkText(text).filter((chunk) => chunk.trim().length > 0);

  for (const chunk of chunks) {
    const embedding = await createEmbedding(chunk);
    const { error } = await supabase.from("document_chunks").insert({
      document_id: documentId,
      content: chunk,
      embedding,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function retrieveContext(query) {
  const queryEmbedding = await createEmbedding(query);
  const limit = Number(process.env.RAG_CONTEXT_LIMIT ?? 6);

  const { data, error } = await supabase
    .from("document_chunks")
    .select("id,document_id,content,embedding")
    .limit(Number(process.env.RAG_MAX_CHUNKS ?? 200));

  if (error) {
    throw new Error(error.message);
  }

  const scored = (data ?? [])
    .map((row) => {
      if (!row.embedding) return null;
      return { ...row, score: cosineSimilarity(queryEmbedding, row.embedding) };
    })
    .filter((row) => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((row) => row.content).join("\n\n");
}
