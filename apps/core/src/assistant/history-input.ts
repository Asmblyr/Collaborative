import { objectInput, InputError } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import {
  parseAssistantContext,
  type AssistantContext,
} from "./context-input.js";
import { assistantLimits } from "./validation.js";
import type { AssistantDataAccess } from "@asmblyr-collaborative/contracts";
import {
  parseAssistantDataAccess,
  assistantDataEnabled,
} from "./data-access.js";

export interface ConversationSubmission {
  conversationId: string;
  messageId: string;
  content: string;
  context: AssistantContext | null;
  dataAccess?: AssistantDataAccess;
  settings: unknown;
}

export function parseConversationSubmission(
  value: unknown,
): ConversationSubmission | null {
  if (!value || typeof value !== "object" || !("conversationId" in value)) {
    return null;
  }
  const body = objectInput(value, [
    "conversationId",
    "messageId",
    "content",
    "context",
    "settings",
    "dataAccess",
  ]);
  if (
    typeof body.content !== "string" ||
    !body.content.trim() ||
    body.content.length > assistantLimits.maxMessageChars ||
    body.content.includes("\0")
  ) {
    throw new InputError("Expected a message up to 8000 characters");
  }
  const context = parseAssistantContext(body.context);
  const dataAccess = parseAssistantDataAccess(body.dataAccess, context);
  return {
    conversationId: parseId(body.conversationId),
    messageId: parseId(body.messageId),
    content: body.content.trim(),
    context,
    ...(dataAccess ? { dataAccess } : {}),
    settings: body.settings,
  };
}

export function conversationScope(
  context: AssistantContext | null,
  dataAccess?: AssistantDataAccess,
): string {
  if (!context) {
    if (dataAccess?.enabled) {
      return `${dataAccess.workspaceId ?? "all"}:data`;
    }
    if (dataAccess?.workspaceId) {
      return `${dataAccess.workspaceId}:chat`;
    }
    return "chat";
  }
  const scope =
    (context.workspaceId ?? "all") +
    ":" +
    context.page +
    ":" +
    (context.collection ?? "");
  const pageScope = context.record
    ? `${scope}:record:${encodeURIComponent(context.record.id)}`
    : scope;
  return assistantDataEnabled(context, dataAccess)
    ? pageScope
    : `${pageScope}:data-off`;
}

export function historyCursor(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,9}$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new InputError("Invalid history cursor");
  }
  return Number(value);
}
