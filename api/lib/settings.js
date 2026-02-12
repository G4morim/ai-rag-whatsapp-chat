import { supabase } from "./supabase.js";

export async function loadSettings() {
  const { data, error } = await supabase.from("settings").select("key,value");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

export function maskApiKey(value) {
  if (!value) return undefined;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
