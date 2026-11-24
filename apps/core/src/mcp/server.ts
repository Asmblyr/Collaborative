import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { createToolSession } from "../tools/session.js";
import type { PluginActions } from "../plugins/actions.js";
import { toolErrorResult } from "../tools/errors.js";

const RESOURCE_NOT_FOUND_CODE = -32002;

/** The same MCP registry and dispatcher serve the website and HTTP adapters. */
export function createMcpServer(
  session: ReturnType<typeof createToolSession>,
  actions?: PluginActions,
) {
  const server = new Server(
    { name: "asmblyr-collaborative", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
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
  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request, extra) => {
      const resources = await session.listSkillResources(extra.signal);
      return { resources };
    },
  );
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request, extra) => {
      await session.authorize(extra.signal);
      return {
        resourceTemplates: [
          {
            uriTemplate: "skill://{slug}",
            name: "skill",
            description: "Инструкция умения ассистента в формате Markdown",
            mimeType: "text/markdown",
          },
        ],
      };
    },
  );
  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request, extra) => {
      const resource = await session.readSkillResource(
        request.params.uri,
        extra.signal,
      );
      if (!resource) {
        throw new McpError(
          RESOURCE_NOT_FOUND_CODE,
          "Skill resource not found.",
        );
      }
      return { contents: [resource] };
    },
  );
  server.setRequestHandler(
    ListPromptsRequestSchema,
    async (_request, extra) => {
      const prompts = await session.listSkillPrompts(extra.signal);
      return { prompts };
    },
  );
  server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
    const prompt = await session.getSkillPrompt(
      request.params.name,
      request.params.arguments,
      extra.signal,
    );
    if (!prompt) {
      throw new McpError(ErrorCode.InvalidParams, "Skill prompt not found.");
    }
    return prompt;
  });
  return server;
}
