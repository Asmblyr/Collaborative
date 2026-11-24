import type { AssistantMessage } from "./assistant-types";

export interface LastAssistantTurn {
  userId: string;
  assistantId: string;
  content: string;
  incomplete: boolean;
}

/** A turn keeps one message ID from its first token through its final result. */
export function replaceTurnMessage(
  messages: AssistantMessage[],
  reply: AssistantMessage,
  previousId = reply.id,
): AssistantMessage[] {
  const matchIndex = messages.findIndex(
    (message) => message.id === previousId || message.id === reply.id,
  );
  if (matchIndex < 0) {
    return [...messages, reply];
  }

  const next: AssistantMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (index === matchIndex) {
      next.push(reply);
      continue;
    }
    if (message.id === previousId || message.id === reply.id) {
      continue;
    }
    next.push(message);
  }
  return next;
}

export function lastAssistantTurn(
  messages: AssistantMessage[],
): LastAssistantTurn | null {
  const conversation = messages.filter((message) => message.id !== "welcome");
  const assistant = conversation.at(-1);
  const user = conversation.at(-2);
  if (
    !assistant ||
    assistant.role !== "assistant" ||
    assistant.streaming ||
    !user ||
    user.role !== "user" ||
    !user.content.trim()
  ) {
    return null;
  }

  return {
    userId: user.id,
    assistantId: assistant.id,
    content: user.content,
    incomplete: Boolean(assistant.cancelled || assistant.failed),
  };
}

export function removeTrailingTurn(
  messages: AssistantMessage[],
  turn: Pick<LastAssistantTurn, "userId" | "assistantId">,
): AssistantMessage[] {
  const last = messages.at(-1);
  const previous = messages.at(-2);
  if (last?.id === turn.assistantId && previous?.id === turn.userId) {
    return messages.slice(0, -2);
  }
  if (last?.id === turn.assistantId) {
    return messages.slice(0, -1);
  }
  return messages;
}
