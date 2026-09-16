export type AiProvider = "huggingface" | "openai" | "custom";

export interface AiMemoConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: AiProvider;
}

const HF_ROUTER = "https://router.huggingface.co/v1";
const OPENAI_API = "https://api.openai.com/v1";
const HF_DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

function hfToken(): string | undefined {
  return (
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HUGGING_FACE_HUB_TOKEN ||
    undefined
  );
}

function looksLikeHfToken(token: string): boolean {
  return token.startsWith("hf_");
}

export function resolveAiMemoConfig(): AiMemoConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  const hfKey = hfToken();
  const explicitBase = process.env.OPENAI_BASE_URL?.replace(/\/$/, "");
  const explicitModel = process.env.OPENAI_MODEL || process.env.HF_MODEL;

  if (hfKey && !explicitBase) {
    return {
      apiKey: hfKey,
      baseUrl: HF_ROUTER,
      model: explicitModel || HF_DEFAULT_MODEL,
      provider: "huggingface",
    };
  }

  if (openaiKey && looksLikeHfToken(openaiKey) && !explicitBase) {
    return {
      apiKey: openaiKey,
      baseUrl: HF_ROUTER,
      model: explicitModel || HF_DEFAULT_MODEL,
      provider: "huggingface",
    };
  }

  if (openaiKey) {
    const baseUrl = explicitBase || OPENAI_API;
    const provider: AiProvider =
      explicitBase && !explicitBase.includes("openai.com")
        ? explicitBase.includes("huggingface")
          ? "huggingface"
          : "custom"
        : "openai";
    return {
      apiKey: openaiKey,
      baseUrl,
      model:
        explicitModel ||
        (provider === "huggingface" ? HF_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL),
      provider,
    };
  }

  if (hfKey && explicitBase) {
    return {
      apiKey: hfKey,
      baseUrl: explicitBase,
      model: explicitModel || HF_DEFAULT_MODEL,
      provider: explicitBase.includes("huggingface")
        ? "huggingface"
        : "custom",
    };
  }

  return null;
}

export function aiMemoConfigured(): boolean {
  return resolveAiMemoConfig() !== null;
}

export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
