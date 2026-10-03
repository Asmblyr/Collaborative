import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { createToolSession } from "../tools/session.js";
import { unavailableToolResult } from "../tools/session.js";
import {
  toolDefinitions,
  type ToolDefinition,
} from "../tools/tool-definitions.js";
import type { PluginActions } from "../plugins/actions.js";
import { ActionInputError, EndpointError } from "@asmblyr/kit";
import { AccessDeniedError } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";

export interface InternalMcpClient {
  definitions: ToolDefinition[];
  call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<object>;
  close(): Promise<void>;
}

function result(data: object, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
    isError,
  };
}

/** In-process MCP only: no socket, HTTP route, stdio endpoint or credentials in tool arguments. */
export async function connectInternalMcp(
  session: ReturnType<typeof createToolSession>,
  actions?: PluginActions,
): Promise<InternalMcpClient> {
  const server = new Server(
    { name: "asmblyr", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  const client = new Client({ name: "asmblyr-assistant", version: "0.0.0" });
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    const access = await session.authorize(extra.signal);
    return {
      tools: [...toolDefinitions, ...(actions?.definitions(access) ?? [])].map(
        (tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
          annotations: tool.annotations ?? {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
        }),
      ),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (actions?.hasTool(request.params.name)) {
        const access = await session.authorize(extra.signal);
        return result(
          await actions.callTool(
            access,
            request.params.name,
            request.params.arguments,
            extra.signal,
          ),
        );
      }
      return result(
        await session.execute(
          request.params.name,
          request.params.arguments,
          extra.signal,
        ),
      );
    } catch (error) {
      if (
        error instanceof AccessDeniedError ||
        ((error instanceof ItemError || error instanceof EndpointError) &&
          error.statusCode === 403)
      ) {
        return result(
          {
            code: "PERMISSION_DENIED",
            error:
              "Недостаточно прав для этого действия или данные недоступны для MCP.",
          },
          true,
        );
      }
      if (error instanceof ActionInputError)
        return result({ error: error.message }, true);
      return result(unavailableToolResult, true);
    }
  });
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
          if (!Array.isArray(content) || content[0]?.type !== "text")
            return unavailableToolResult;
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
