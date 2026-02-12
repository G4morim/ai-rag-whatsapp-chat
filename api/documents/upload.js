import formidable from "formidable";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import pdf from "pdf-parse";
import { supabase } from "../lib/supabase.js";
import { getOptionalEnv } from "../lib/env.js";
import { storeDocumentChunks } from "../lib/rag.js";
import { withCors } from "../lib/cors.js";

const SUPPORTED_TYPES = new Set(["application/pdf", "text/plain", "text/markdown"]);

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

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withCors(async function handler(req, res) {
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
});
