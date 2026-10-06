import type { AssistantStatus, ReasoningEffort } from "./assistant-types";
import type { AssistantStatusFailure } from "./assistant-status-state";

export class AssistantStatusRequestError extends Error {
  constructor(readonly failure: AssistantStatusFailure = "request") {
    super("Assistant status is unavailable");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssistantStatusRequestError();
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new AssistantStatusRequestError();
  }
  return value;
}

const efforts = new Set(["low", "medium", "high", "max"]);
function parseSettings(value: unknown): AssistantStatus["settings"] {
  if (value === undefined) {
    return undefined;
  }
  const settings = object(value);
  if (
    !Array.isArray(settings.reasoningOptions) ||
    !settings.reasoningOptions.every(
      (entry) => typeof entry === "string" && efforts.has(entry),
    ) ||
    (settings.defaultEffort !== null &&
      (typeof settings.defaultEffort !== "string" ||
        !settings.reasoningOptions.includes(settings.defaultEffort))) ||
    typeof settings.thinking !== "string" ||
    !["required", "optional", "unsupported"].includes(settings.thinking) ||
    typeof settings.defaultThinking !== "boolean"
  ) {
    throw new AssistantStatusRequestError();
  }
  return {
    reasoningOptions: [...settings.reasoningOptions] as ReasoningEffort[],
    defaultEffort: settings.defaultEffort as ReasoningEffort | null,
    thinking: settings.thinking as "required" | "optional" | "unsupported",
    defaultThinking: settings.defaultThinking,
  };
}

export function parseAssistantStatus(value: unknown): AssistantStatus {
  const data = object(object(value).data);
  if (data.available === false) {
    return { available: false };
  }
  if (
    data.available !== true ||
    (data.model !== undefined && typeof data.model !== "string")
  ) {
    throw new AssistantStatusRequestError();
  }
  const limits = object(data.limits);
  return {
    available: true,
    ...(typeof data.model === "string" ? { model: data.model } : {}),
    limits: {
      maxMessages: positiveInteger(limits.maxMessages),
      maxMessageChars: positiveInteger(limits.maxMessageChars),
      maxConversationChars: positiveInteger(limits.maxConversationChars),
    },
    settings: parseSettings(data.settings),
  };
}

export async function requestAssistantStatus(
  signal: AbortSignal,
  fetchStatus: typeof fetch = fetch,
): Promise<AssistantStatus> {
  const response = await fetchStatus("/api/assistant/status", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    throw new AssistantStatusRequestError("session");
  }
  if (response.status === 403) {
    throw new AssistantStatusRequestError("access");
  }
  if (!response.ok) {
    throw new AssistantStatusRequestError();
  }
  return parseAssistantStatus(await response.json());
}
