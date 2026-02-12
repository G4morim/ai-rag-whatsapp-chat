const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_VARS)[number];

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variaveis de ambiente ausentes: ${missing.join(", ")}`);
  }
}

export function getOptionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
