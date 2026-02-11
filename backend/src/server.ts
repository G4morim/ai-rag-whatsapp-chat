import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import { supabase } from "./supabase.js";

async function testDb() {
  const { data, error } = await supabase.from("config").select("*").limit(1);

  if (error) {
    console.error("Erro Supabase:", error);
  } else {
    console.log("Conectado ao Supabase!", data);
  }
}

testDb();