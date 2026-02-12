import { getOptionalEnv } from "./env.js";
import { loadSettings } from "./settings.js";

export async function requestChatCompletion(messages) {
  const settings = await loadSettings();
  const apiKey = settings.OPENROUTER_API_KEY;
  const model =
    settings.OPENROUTER_MODEL ??
    process.env.OPENROUTER_MODEL ??
    "gpt-4.1-mini";
  const baseUrl = getOptionalEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
  const maxTokens = Number(getOptionalEnv("OPENROUTER_MAX_TOKENS", "0"));

  if (!apiKey || !model) {
    throw new Error("Configuracao do OpenRouter ausente.");
  }

  const body = {
    model,
    messages,
    ...(Number.isFinite(maxTokens) && maxTokens > 0 ? { max_tokens: maxTokens } : {}),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao chamar OpenRouter: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Resposta do OpenRouter invalida.");
  }

  return content;
}
