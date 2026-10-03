import type { AssistantUsage } from "@asmblyr/contracts";
export type { AssistantUsage } from "@asmblyr/contracts";

export interface AssistantResponseMetadata {
  model: string | null;
  responseId: string | null;
  requestId: string | null;
  finishReason: string | null;
  usage: AssistantUsage;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function counter(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
    ? value
    : null;
}

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

// Normalize only documented, allowlisted metadata; never persist arbitrary provider payloads.
export function responseMetadata(
  value: unknown,
  api: "responses" | "chat-completions",
): AssistantResponseMetadata {
  const response = object(value),
    usage = object(response.usage);
  const responses = api === "responses";
  const choice = object(Array.isArray(response.choices) ? response.choices[0] : undefined);
  return {
    model: identifier(response.model),
    responseId: identifier(response.id),
    requestId: identifier(response._request_id) ?? identifier(response.request_id),
    finishReason: identifier(
      responses
        ? (object(response.incomplete_details).reason ?? response.status)
        : choice.finish_reason,
    ),
    usage: {
      inputTokens: counter(responses ? usage.input_tokens : usage.prompt_tokens),
      outputTokens: counter(responses ? usage.output_tokens : usage.completion_tokens),
      totalTokens: counter(usage.total_tokens),
      cachedTokens: counter(
        object(responses ? usage.input_tokens_details : usage.prompt_tokens_details).cached_tokens,
      ),
      reasoningTokens: counter(
        object(responses ? usage.output_tokens_details : usage.completion_tokens_details)
          .reasoning_tokens,
      ),
    },
  };
}
