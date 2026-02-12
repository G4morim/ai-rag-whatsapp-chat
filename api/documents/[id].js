import { supabase } from "../lib/supabase.js";
import { getOptionalEnv } from "../lib/env.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Metodo nao permitido." });
  }

  const { id } = req.query;
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
