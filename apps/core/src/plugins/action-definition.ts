import type {
  EndpointDefinition,
  PluginAction,
} from "@asmblyr-collaborative/kit";
import { z } from "@asmblyr-collaborative/kit/actions";

const actionId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
const actionSchema = z.strictObject({
  connection: z.literal("google").optional(),
  id: actionId,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  page: actionId.optional(),
  access: z.enum(["authenticated", "superuser"]),
  mcp: z.boolean(),
  readOnly: z.boolean().optional(),
  inputSchema: z.looseObject({
    type: z.literal("object"),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()),
    additionalProperties: z.literal(false),
  }),
  parseInput: z.custom<PluginAction["parseInput"]>(
    (value) => typeof value === "function",
  ),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  parseOutput: z.custom<PluginAction["parseOutput"]>(
    (value) => typeof value === "function",
  ),
});

export function parseEndpointAction(
  endpoint: EndpointDefinition,
  plugin: string,
): PluginAction | undefined {
  const value = endpoint.handler.meta?.asmblyr;
  if (value === undefined) return;
  const parsed = actionSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Plugin ${plugin}: invalid action definition`);
  if (endpoint.method !== "POST" || endpoint.path.includes(":")) {
    throw new Error(
      `Plugin ${plugin}: calculations require a static .post.ts route`,
    );
  }
  return parsed.data;
}
