import type { FilterProposal } from "./assistant-context-types";
import type {
  AssistantSelection,
  AssistantTurnSummary,
  AssistantPluginResult,
} from "@asmblyr/contracts";

export interface AssistantMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  truncated?: boolean;
  cancelled?: boolean;
  failed?: boolean;
  streaming?: boolean;
  selections?: AssistantSelection[];
  pluginResults?: AssistantPluginResult[];
  summary?: AssistantTurnSummary;
  proposals?: FilterProposal[];
  contextScope?: string;
  contextLabel?: string;
}

export type ReasoningEffort = "low" | "medium" | "high" | "max";
export const effortLabels: Record<ReasoningEffort, string> = {
  low: "Быстро",
  medium: "Сбалансированно",
  high: "Вдумчиво",
  max: "Максимальная глубина",
};
export const ASSISTANT_SETTINGS_CHANGED = "asmblyr:assistant-settings-changed";
export interface AssistantSettings {
  reasoningEffort?: ReasoningEffort;
  thinking?: boolean;
}
export interface AssistantStatus {
  available: boolean;
  model?: string;
  limits?: {
    maxMessages: number;
    maxMessageChars: number;
    maxConversationChars: number;
  };
  settings?: {
    reasoningOptions: ReasoningEffort[];
    defaultEffort: ReasoningEffort | null;
    thinking: "required" | "optional" | "unsupported";
    defaultThinking: boolean;
  };
}

export const welcomeMessage: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Привет! Помогу найти доступные вам коллекции, разобраться в полях и связях, найти записи, прочитать их по ID или посчитать. Для открытой таблицы могу предложить фильтр. При включённом контексте запрошенные данные передаются AI-провайдеру. Черновики форм мне недоступны; изменять данные я пока не умею.",
};
export const suggestions = [
  "Как спроектировать коллекцию товаров?",
  "Объясни связи между коллекциями",
];

// Keep complete user/assistant pairs. Displayed history stays intact in this browser tab.
export function conversationInput(
  messages: AssistantMessage[],
  content: string,
  status: AssistantStatus,
) {
  const limits = status.limits!;
  const history = messages
    .filter((message) => message.id !== "welcome")
    .filter((message, index, entries) => {
      const incomplete = (entry: AssistantMessage | undefined) =>
        entry?.cancelled || entry?.failed || entry?.streaming;
      return !incomplete(message) && !incomplete(entries[index + 1]);
    })
    .map(({ role, content }) => ({
      role,
      // Several model steps can exceed one input message's budget. Keep the
      // newest details and final result for follow-ups; visible text stays intact.
      content: content.slice(-limits.maxMessageChars),
    }));
  history.push({ role: "user", content });
  while (
    history.length > limits.maxMessages ||
    history.reduce((size, message) => size + message.content.length, 0) >
      limits.maxConversationChars
  )
    history.splice(0, 2);
  return history;
}
