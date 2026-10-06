import type { AssistantDataAccess } from "@asmblyr-collaborative/contracts";
import { objectInput, InputError } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import type { AssistantContext } from "./context-input.js";

export function parseAssistantDataAccess(
  value: unknown,
  context: AssistantContext | null,
): AssistantDataAccess | undefined {
  if (value === undefined) {
    return undefined;
  }
  const body = objectInput(value, ["enabled", "workspaceId"]);
  if (typeof body.enabled !== "boolean" || body.workspaceId === undefined) {
    throw new InputError(
      "Expected explicit assistant data access and workspace",
    );
  }
  const workspaceId =
    body.workspaceId === null ? null : parseId(body.workspaceId);
  if (context && context.workspaceId !== workspaceId) {
    throw new InputError("Assistant data access and page workspace must match");
  }
  return { enabled: body.enabled, workspaceId };
}

/** Omission preserves the previous API: context off means plain chat. */
export function assistantDataEnabled(
  context: AssistantContext | null,
  dataAccess?: AssistantDataAccess,
): boolean {
  return dataAccess?.enabled ?? Boolean(context);
}
