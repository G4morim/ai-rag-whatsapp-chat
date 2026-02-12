import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import pdf from "pdf-parse";
import { supabase } from "../supabase.js";
import { getOptionalEnv } from "../lib/env.js";
import { storeDocumentChunks } from "../lib/rag.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const SUPPORTED_TYPES = new Set(["application/pdf", "text/plain", "text/markdown"]);

function isSupportedMime(mime: string): boolean {
  if (SUPPORTED_TYPES.has(mime)) return true;
  return mime.endsWith("/markdown") || mime.endsWith("/x-markdown");
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const parsed = await pdf(buffer);
    return parsed.text;
  }

  return buffer.toString("utf8");
}

router.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("documents")
    .select("id,filename,mime_type,size,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
});

router.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Arquivo nao enviado." });
  }

  if (!isSupportedMime(file.mimetype)) {
    return res.status(400).json({ error: "Tipo de arquivo nao suportado." });
  }

  try {
    const bucket = getOptionalEnv("SUPABASE_DOCS_BUCKET", "documents");
    const documentId = randomUUID();
    const storagePath = `${documentId}/${file.originalname}`;

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });

    if (storageError) {
      return res.status(500).json({ error: storageError.message });
    }

    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      filename: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      storage_path: storagePath,
    });

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    const text = await extractText(file.buffer, file.mimetype);
    await storeDocumentChunks(documentId, text);

    return res.json({ id: documentId, filename: file.originalname });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
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

  return res.json({ success: true });
});

export default router;
