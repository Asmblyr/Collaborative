import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { createToolSession } from "../tools/session.js";
import { unavailableToolResult } from "../tools/session.js";
import type { ToolDefinition } from "../tools/tool-definitions.js";
import type { PluginActions } from "../plugins/actions.js";
import { createMcpServer } from "./server.js";

export interface InternalMcpClient {
  definitions: ToolDefinition[];
  call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<object>;
  close(): Promise<void>;
}

/** Website adapter for the shared MCP server; it has no separate tool registry. */
export async function connectInternalMcp(
  session: ReturnType<typeof createToolSession>,
  actions?: PluginActions,
): Promise<InternalMcpClient> {
  const server = createMcpServer(session, actions);
  const client = new Client({ name: "asmblyr-assistant", version: "0.1.0" });
  async function close(): Promise<void> {
    await client.close();
    await server.close();
  }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    // Advertise the same contracts that the MCP server actually exposes.
    const definitions = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as ToolDefinition["parameters"],
      annotations: {
        readOnlyHint: tool.annotations?.readOnlyHint ?? false,
        destructiveHint: tool.annotations?.destructiveHint ?? true,
        openWorldHint: tool.annotations?.openWorldHint ?? true,
      },
    }));
    return {
      definitions,
      close,
      async call(name, args, signal) {
        try {
          signal?.throwIfAborted();
          const response = await client.callTool(
            { name, arguments: args },
            undefined,
            {
              signal,
              timeout: 10_000,
            },
          );
          signal?.throwIfAborted();
          const content = response.content;
          if (!Array.isArray(content) || content[0]?.type !== "text") {
            return unavailableToolResult;
          }
          return JSON.parse(content[0].text) as object;
        } catch {
          return unavailableToolResult;
        }
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
