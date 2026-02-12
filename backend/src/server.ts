import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import settingsRoutes from "./routes/settings.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import whatsappRoutes from "./routes/whatsapp.routes.js";
import { supabase } from "./supabase.js";
import { validateEnv } from "./lib/env.js";

dotenv.config({ path: "./.env" });
validateEnv();

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/settings", settingsRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/whatsapp", whatsappRoutes);

async function testDb() {
  const { data, error } = await supabase.from("config").select("*").limit(1);

  if (error) {
    console.error("Erro Supabase:", error);
  } else {
    console.log("Conectado ao Supabase!", data);
  }
}

testDb();

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});