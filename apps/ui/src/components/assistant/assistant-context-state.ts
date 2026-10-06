import { contextScope, type PageContext } from "./assistant-context-types";
import type { AssistantMessage } from "./assistant-types";
import type { AssistantDataAccess } from "@asmblyr-collaborative/contracts";

export interface AssistantContextState {
  changed: boolean;
  activeLabel: string | null;
}

/** Compare with the submitted question, never rebind an in-flight request. */
export function assistantContextState(
  messages: AssistantMessage[],
  context: PageContext | null,
  pending: boolean,
  dataAccess?: AssistantDataAccess,
): AssistantContextState {
  const latest = messages.findLast((message) => message.role === "user");
  const changed = Boolean(
    latest?.contextScope &&
      latest.contextScope !== contextScope(context, dataAccess),
  );

  return {
    changed,
    activeLabel: pending && changed ? (latest?.contextLabel ?? "") : null,
  };
}

/** Boundaries belong to questions, not replies, and survive history restoration. */
export function assistantContextBoundaries(
  messages: AssistantMessage[],
): Set<string> {
  const boundaries = new Set<string>();
  let previous: string | undefined;

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    if (previous && message.contextScope && previous !== message.contextScope) {
      boundaries.add(message.id);
    }
    // A legacy message without a scope cannot prove a transition.
    previous = message.contextScope;
  }

  return boundaries;
}
