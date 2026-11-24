import { objectInput, InputError } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import { parseSkillSlug } from "../skills/validation.js";
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
  skillSlug?: string | null;
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
    "skillSlug",
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
  const skillSlug =
    body.skillSlug === undefined || body.skillSlug === null
      ? null
      : parseSkillSlug(body.skillSlug);
  return {
    conversationId: parseId(body.conversationId),
    messageId: parseId(body.messageId),
    content: body.content.trim(),
    context,
    ...(dataAccess ? { dataAccess } : {}),
    ...(skillSlug ? { skillSlug } : {}),
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
