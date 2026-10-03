export type ReasoningEffort = "low" | "medium" | "high" | "max";
export interface AssistantConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  api: "responses" | "chat-completions";
  zai: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
  reasoningOptions: ReasoningEffort[];
  defaultEffort: ReasoningEffort | null;
  thinking: "required" | "optional" | "unsupported";
  defaultThinking: boolean;
}

function booleanSetting(value: string | undefined, fallback: boolean, name: string): boolean {
  if (!value?.trim()) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid ${name}: expected true or false`);
}

function numberSetting(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  const number = value?.trim() ? Number(value) : fallback;
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}`);
  return number;
}

export function assistantConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AssistantConfig | null {
  if (!booleanSetting(env.ASSISTANT_ENABLED, true, "ASSISTANT_ENABLED") || !env.OPENAI_API_KEY?.trim()) return null;
  const model = env.OPENAI_API_MODEL?.trim();
  if (!model || model.length > 120 || /\s/.test(model)) throw new Error("OPENAI_API_MODEL is required and must be a model ID");
  let url: URL;
  try { url = new URL(env.OPENAI_API_BASE_URL?.trim() || "https://api.openai.com/v1/"); }
  catch { throw new Error("Invalid OPENAI_API_BASE_URL"); }
  if (url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("OPENAI_API_BASE_URL must use HTTPS (HTTP allowed for loopback only), without credentials or query");
  }
  const zai = url.hostname === "api.z.ai";
  const glm53 = zai && /^glm-5\.3(?:$|-)/.test(model);
  const api = env.OPENAI_API_MODE?.trim() || (url.hostname === "api.openai.com" ? "responses" : "chat-completions");
  if (api !== "responses" && api !== "chat-completions") throw new Error("Invalid OPENAI_API_MODE");
  if (zai && api !== "chat-completions") throw new Error("Z.ai integration currently requires OPENAI_API_MODE=chat-completions");
  const effort = env.OPENAI_API_MODEL_EFFORT?.trim();
  const reasoningOptions: ReasoningEffort[] = glm53 ? ["low", "high", "max"] : effort ? ["low", "medium", "high"] : [];
  if (effort && !reasoningOptions.includes(effort as ReasoningEffort)) throw new Error("Invalid OPENAI_API_MODEL_EFFORT for this model");
  const thinking = glm53 ? "required" : zai && api === "chat-completions" ? "optional" : "unsupported";
  const defaultThinking = booleanSetting(env.OPENAI_API_MODEL_THINKING, true, "OPENAI_API_MODEL_THINKING");
  if (thinking === "required" && !defaultThinking) throw new Error("GLM-5.3 requires OPENAI_API_MODEL_THINKING=true");
  if (env.OPENAI_API_MODEL_THINKING && thinking === "unsupported") throw new Error("OPENAI_API_MODEL_THINKING is only supported for Z.ai models");
  return {
    apiKey: env.OPENAI_API_KEY.trim(), baseURL: url.href, model, api, zai,
    timeoutMs: numberSetting(env.OPENAI_API_TIMEOUT_MS, 120_000, 1_000, 120_000, "OPENAI_API_TIMEOUT_MS"),
    maxOutputTokens: numberSetting(env.OPENAI_API_MAX_OUTPUT_TOKENS, 4096, 128, 16_384, "OPENAI_API_MAX_OUTPUT_TOKENS"),
    reasoningOptions, defaultEffort: effort as ReasoningEffort || (glm53 ? "high" : null), thinking, defaultThinking,
  };
}
