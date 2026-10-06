import type {
  AssistantTurnSummary,
  AssistantUsage,
  UiLocale,
} from "@asmblyr-collaborative/contracts";
export type AssistantRequestUsage = AssistantUsage;

export interface AssistantRequest {
  id: string;
  turnId: string;
  callIndex: number;
  turnSummary: AssistantTurnSummary | null;
  user: { id: string; displayName: string | null; email: string | null };
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  provider: string;
  api: string;
  requestedModel: string;
  model: string | null;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  reasoningEffort: string | null;
  thinking: boolean | null;
  truncated: boolean | null;
  responseId: string | null;
  requestId: string | null;
  finishReason: string | null;
  usage: AssistantRequestUsage;
}

export interface AssistantTelemetryResult {
  items: AssistantRequest[];
  nextCursor: string | null;
  period: { days: number; from: string; until: string };
  summary: AssistantRequestUsage & {
    requests: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    pending: number;
    withUsage: number;
  };
}

export function tokenCount(value: number | null, locale: UiLocale = "ru") {
  return value === null
    ? "—"
    : value.toLocaleString(locale === "en" ? "en-US" : "ru-RU");
}
