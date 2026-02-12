const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variaveis de ambiente ausentes: ${missing.join(", ")}`);
  }
}

export function getOptionalEnv(key, fallback) {
  return process.env[key] ?? fallback;
}
