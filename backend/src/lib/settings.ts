import { supabase } from "../supabase.js";

type SettingsMap = {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_EMBEDDINGS_MODEL?: string;
  SYSTEM_PROMPT?: string;
};

export async function loadSettings(): Promise<SettingsMap> {
  const { data, error } = await supabase.from("settings").select("key,value");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce<SettingsMap>((acc, item) => {
    acc[item.key as keyof SettingsMap] = item.value as string;
    return acc;
  }, {});
}

export function maskApiKey(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
