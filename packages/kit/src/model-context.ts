import type { EventHandler, EventHandlerWithFetch } from "h3";
import { defineHandler } from "h3";
import { AccessGate, type AccessMiddleware } from "./access-gate.js";
import type { ModelDefinition } from "./model-schema.js";
import { modelValidator } from "./model-schema.js";
import { ActionInputError, type PluginAction } from "./action.js";
import { actionInputSchema, z } from "./action-contract.js";

export interface ModelAnnotation {
  readonly title: string;
  readonly description: string;
  readonly middleware: AccessMiddleware;
  readonly page?: string;
  /** Also prevents writes through the action's items capability. Defaults to false. */
  readonly readOnly?: boolean;
}

declare module "h3" {
  interface H3RouteMeta {
    asmblyrModel?: ModelAnnotation;
  }
}

export function defineModelAnnotation(
  annotation: ModelAnnotation,
): ModelAnnotation {
  if (!annotation.title.trim() || !annotation.description.trim()) {
    throw new Error("Model title and description are required");
  }
  if (
    ![AccessGate.authenticated, AccessGate.superuser].includes(
      annotation.middleware,
    )
  ) {
    throw new Error("Model annotations require an explicit AccessGate");
  }
  return Object.freeze({ ...annotation });
}

/** The builder resolves Input and the inner handler's return type before TS erases them. */
export function defineModelContext<Input extends object>(
  handler: EventHandlerWithFetch<{ body: Input }>,
  annotation: ModelAnnotation,
): EventHandlerWithFetch<{ body: Input }> {
  const model = defineModelAnnotation(annotation);
  return defineHandler({
    meta: { ...handler.meta, asmblyrModel: model },
    middleware: [model.middleware],
    handler,
  });
}

/** Used by the host loader for source and built packages. Not a second route registration. */
export function bindModelDefinition(
  handler: EventHandler,
  definition: ModelDefinition,
): void {
  const annotation = handler.meta?.asmblyrModel;
  if (!annotation)
    throw new Error("Generated model has no matching annotated handler");
  const input = modelValidator<object>(definition.inputSchema);
  const output = modelValidator<object>(definition.outputSchema);
  if (!(input instanceof z.ZodObject) || !(output instanceof z.ZodObject)) {
    throw new Error("Model inputs and outputs must be JSON objects");
  }
  const action: PluginAction = Object.freeze({
    id: definition.id,
    title: annotation.title,
    description: annotation.description,
    page: annotation.page,
    access: annotation.middleware.access,
    mcp: true,
    readOnly: annotation.readOnly ?? false,
    inputSchema: actionInputSchema(input),
    parseInput(value: unknown) {
      const result = input.safeParse(value);
      if (!result.success) throw new ActionInputError(zodMessage(result.error));
      return result.data;
    },
    parseOutput: (value: unknown) => output.parse(value),
  });
  handler.meta = { ...handler.meta, asmblyr: action };
}

function zodMessage(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}
