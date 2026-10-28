import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { createToolSession } from "../tools/session.js";
import type { PluginActions } from "../plugins/actions.js";
import { toolErrorResult } from "../tools/errors.js";

/** The same MCP registry and dispatcher serve the website and HTTP adapters. */
export function createMcpServer(
  session: ReturnType<typeof createToolSession>,
  actions?: PluginActions,
) {
  const server = new Server(
    { name: "asmblyr-collaborative", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    const access = await session.authorize(extra.signal);
    const definitions = [
      ...session.definitions(access),
      ...((await actions?.availableDefinitions(access)) ?? []),
    ];
    return {
      tools: definitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
        annotations: tool.annotations ?? {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      })),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    let output: object;
    try {
      if (actions?.hasTool(request.params.name)) {
        output = await actions.callTool(
          await session.authorize(extra.signal),
          request.params.name,
          request.params.arguments,
          extra.signal,
        );
      } else {
        output = await session.execute(
          request.params.name,
          request.params.arguments,
          extra.signal,
        );
      }
    } catch (error) {
      output = toolErrorResult(error);
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
      structuredContent: output as Record<string, unknown>,
      isError: "error" in output,
    };
  });
  return server;
}
