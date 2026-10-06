import type { AssistantTurnSummary } from "./index.js";
import type { AssistantActivity } from "./assistant.js";

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  compactionCount: number;
  busyUntil: string | null;
}

export interface AssistantHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  activity?: AssistantActivity[];
  status: "pending" | "completed" | "failed" | "cancelled" | "interrupted";
  createdAt: string;
  contextScope: string;
  contextLabel: string;
  truncated: boolean;
  summary: AssistantTurnSummary | null;
}

export interface AssistantConversationPage {
  items: AssistantConversation[];
  nextCursor: string | null;
}

export interface AssistantConversationDetail {
  conversation: AssistantConversation;
  messages: AssistantHistoryMessage[];
  nextCursor: string | null;
}

export interface AssistantConversationReceipt {
  id: string;
  userMessageId: string;
  assistantMessageId: string;
  compactionCount: number;
}
