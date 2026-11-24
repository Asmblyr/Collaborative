import type { FilterProposal } from "./assistant-context-types";
import type {
  AssistantSelection,
  AssistantStreamEvent,
  AssistantTurnSummary,
  AssistantPluginResult,
  AssistantActivity,
} from "@asmblyr-collaborative/contracts";

export interface AssistantWriteDiffEntry {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface AssistantWriteProposalCard {
  type: "write_proposal";
  proposalId: string;
  collection: string;
  collectionDisplayName: string;
  operation: "create" | "update";
  recordId: string | null;
  summary: string;
  diff: AssistantWriteDiffEntry[];
  status: "pending" | "confirmed" | "rejected";
  expiresAt: string;
}

export interface AssistantRecordCardField {
  field: string;
  label: string;
  value: string | null;
}

export interface AssistantRecordCard {
  type: "record";
  collection: string;
  collectionId: string;
  collectionDisplayName: string;
  recordId: string;
  title: string;
  summary: string | null;
  fields: AssistantRecordCardField[];
}

export interface AssistantFormCardField {
  field: string;
  label: string;
  value: unknown;
}

export interface AssistantFormCard {
  type: "form";
  collection: string;
  collectionId: string;
  collectionDisplayName: string;
  summary: string | null;
  values: Record<string, unknown>;
  fields: AssistantFormCardField[];
}

export type AssistantAnswerPayload = Extract<
  AssistantStreamEvent,
  { type: "answer" }
>["data"] & {
  writeProposals?: AssistantWriteProposalCard[];
  records?: AssistantRecordCard[];
  forms?: AssistantFormCard[];
};

export interface AssistantMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  activity?: AssistantActivity[];
  activityDraft?: string;
  startedAt?: number;
  truncated?: boolean;
  cancelled?: boolean;
  failed?: boolean;
  streaming?: boolean;
  selections?: AssistantSelection[];
  pluginResults?: AssistantPluginResult[];
  connectionWrites?: import("@asmblyr-collaborative/contracts").ConnectionWriteProposal[];
  writeProposals?: AssistantWriteProposalCard[];
  records?: AssistantRecordCard[];
  forms?: AssistantFormCard[];
  summary?: AssistantTurnSummary;
  proposals?: FilterProposal[];
  contextScope?: string;
  contextLabel?: string;
  skillSlug?: string;
  skillTitle?: string;
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
  // The empty conversation is rendered by AssistantWelcome, never sent to the model.
  content: "",
};

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
