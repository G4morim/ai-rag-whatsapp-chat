import { supabase } from "../lib/supabase.js";
import { withCors } from "../lib/cors.js";

export default withCors(async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Metodo nao permitido." });
});
  const { data, error } = await supabase
    .from("documents")
    .select("id,filename,mime_type,size,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data ?? []);
}
