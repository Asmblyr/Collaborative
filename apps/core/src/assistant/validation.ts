import { AuthInputError } from "../auth/validation.js";
import { objectInput } from "../shared/input.js";
import type { AssistantConfig, ReasoningEffort } from "./config.js";
import { parseAssistantContext, type AssistantContext } from "./context-input.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AssistantInput {
  messages: ChatMessage[];
  reasoningEffort: ReasoningEffort | null;
  thinking: boolean;
  context?: AssistantContext | null;
}
export const assistantLimits = {
  maxMessages: 31,
  maxMessageChars: 8000,
  maxConversationChars: 32000,
};

export function parseAssistantInput(value: unknown, config: AssistantConfig): AssistantInput {
  const body = objectInput(value, ["messages", "settings", "context"]);
  if (
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    body.messages.length > assistantLimits.maxMessages
  ) {
    throw new AuthInputError("Expected 1–31 conversation messages");
  }
  let total = 0;
  const messages = body.messages.map((item, index): ChatMessage => {
    const message = objectInput(item, ["role", "content"]);
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (
      message.role !== expectedRole ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > assistantLimits.maxMessageChars ||
      message.content.includes("\0")
    ) {
      throw new AuthInputError(
        "Expected alternating user/assistant messages up to 8000 characters",
      );
    }
    total += message.content.length;
    return { role: expectedRole, content: message.content.trim() };
  });
  if (messages.at(-1)?.role !== "user" || total > assistantLimits.maxConversationChars) {
    throw new AuthInputError(
      "Conversation must end with a user message and fit within 32000 characters",
    );
  }
  const settings =
    body.settings === undefined ? {} : objectInput(body.settings, ["reasoningEffort", "thinking"]);
  const reasoningEffort = settings.reasoningEffort ?? config.defaultEffort;
  if (
    reasoningEffort !== null &&
    !config.reasoningOptions.includes(reasoningEffort as ReasoningEffort)
  ) {
    throw new AuthInputError("Unsupported reasoning effort");
  }
  const thinking = settings.thinking ?? config.defaultThinking;
  if (
    typeof thinking !== "boolean" ||
    (config.thinking === "required" && !thinking) ||
    (config.thinking === "unsupported" && settings.thinking !== undefined)
  )
    throw new AuthInputError("Unsupported thinking setting");
  return {
    messages,
    reasoningEffort: reasoningEffort as ReasoningEffort | null,
    thinking,
    ...(body.context === undefined ? {} : { context: parseAssistantContext(body.context) }),
  };
}
