import { z } from "zod";

export { z } from "zod";

export interface ActionContract<
  Input extends z.ZodObject,
  Output extends z.ZodObject,
> {
  id: string;
  title: string;
  description: string;
  input: Input;
  output: Output;
  /** A registered plugin page that accepts this action's prepared values. */
  page?: string;
}

/** @deprecated Model handlers now generate schemas from TypeScript during plugin build. */
export function defineActionContract<
  Input extends z.ZodObject,
  Output extends z.ZodObject,
>(contract: ActionContract<Input, Output>): ActionContract<Input, Output> {
  const id = /^[a-z][a-z0-9-]{0,31}$/;
  if (!id.test(contract.id) || (contract.page && !id.test(contract.page))) {
    throw new Error(
      "Action and page ids must be URL-safe, up to 32 characters",
    );
  }
  if (!contract.title.trim() || !contract.description.trim()) {
    throw new Error("Action title and description are required");
  }
  return Object.freeze(contract);
}

export interface ActionInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

/** Strict function calling requires explicit object keys, including nullable values. */
export function actionInputSchema(schema: z.ZodObject): ActionInputSchema {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  function check(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(check);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === "object") {
      const keys = Object.keys((node.properties ?? {}) as object);
      const required = node.required as string[] | undefined;
      if (
        node.additionalProperties !== false ||
        keys.some((key) => !required?.includes(key))
      ) {
        throw new Error(
          "Action inputs must use strict objects and required keys; use nullable for optional values",
        );
      }
    }
    Object.values(node).forEach(check);
  }
  check(json);
  const parameters = { ...json };
  delete parameters.$schema;
  return { ...parameters, required: json.required ?? [] } as ActionInputSchema;
}
