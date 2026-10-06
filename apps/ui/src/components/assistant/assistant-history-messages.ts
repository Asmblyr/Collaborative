import type { AssistantHistoryMessage } from "@asmblyr-collaborative/contracts";
import type { AssistantMessage } from "./assistant-types";

/** Archived actions are never reactivated when restoring a transcript. */
export function restoreAssistantMessages(
  messages: AssistantHistoryMessage[],
): AssistantMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    activity: message.activity,
    contextScope: message.contextScope,
    contextLabel: message.contextLabel,
    truncated: message.truncated,
    cancelled:
      message.status === "cancelled" || message.status === "interrupted",
    failed: message.status === "failed",
    streaming: message.status === "pending",
    summary: message.summary ?? undefined,
  }));
}

export function prependAssistantHistory(
  current: AssistantMessage[],
  older: AssistantMessage[],
): AssistantMessage[] {
  const ids = new Set(older.map((message) => message.id));
  return [
    ...older,
    ...current.filter(
      (message) => message.id !== "welcome" && !ids.has(message.id),
    ),
  ];
}
