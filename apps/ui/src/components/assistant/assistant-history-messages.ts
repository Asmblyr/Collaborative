import type {
  AssistantConversation,
  AssistantHistoryMessage,
} from "@asmblyr-collaborative/contracts";
import type { AssistantMessage } from "./assistant-types";

export const MAX_CONVERSATION_TITLE_LENGTH = 120;

export type ConversationTitleValidation =
  | { ok: true; title: string }
  | { ok: false; reason: "empty" | "too_long" | "invalid_char" };

export function validateConversationTitle(
  raw: string,
): ConversationTitleValidation {
  if (raw.includes("\0")) {
    return { ok: false, reason: "invalid_char" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > MAX_CONVERSATION_TITLE_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, title: trimmed };
}

export function applyConversationRename<
  T extends Pick<AssistantConversation, "id" | "title" | "updatedAt">,
>(items: readonly T[], updated: T): T[] {
  let replaced = false;
  const next = items.map((item) => {
    if (item.id !== updated.id) {
      return item;
    }
    replaced = true;
    return { ...item, ...updated };
  });
  return replaced ? next : [...items];
}

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

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replaceAll("ё", "е");
}

export function filterHistoryConversations<
  T extends { title: string; preview?: string | null },
>(items: readonly T[], query: string, fallbackTitle: string): T[] {
  const needle = normalizeSearchText(query.trim());
  if (!needle) {
    return [...items];
  }

  return items.filter((item) => {
    const title = normalizeSearchText(item.title || fallbackTitle);
    const preview = item.preview ? normalizeSearchText(item.preview) : "";
    return title.includes(needle) || preview.includes(needle);
  });
}
