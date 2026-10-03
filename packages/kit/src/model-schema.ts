import { z } from "zod";

/** Generated JSON only. Safe to import from a plugin's browser entry. */
export interface ModelDefinition {
  id: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export function modelValidator<Value = unknown>(
  schema: Record<string, unknown>,
): z.ZodType<Value> {
  return z.fromJSONSchema(schema) as z.ZodType<Value>;
}

export function modelField(
  schema: Record<string, unknown>,
  name: string,
): {
  title?: string;
  description?: string;
} {
  const properties = schema.properties as Record<string, object> | undefined;
  return properties?.[name] ?? {};
}
