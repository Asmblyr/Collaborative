import type { AssistantMessage } from "./assistant-types";

/** A turn keeps one message ID from its first token through its final result. */
export function replaceTurnMessage(
  messages: AssistantMessage[],
  reply: AssistantMessage,
): AssistantMessage[] {
  const index = messages.findIndex((message) => message.id === reply.id);
  if (index < 0) {
    return [...messages, reply];
  }
  return messages.map((message, at) => (at === index ? reply : message));
}
