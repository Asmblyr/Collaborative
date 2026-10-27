import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { toolDefinitions } from "../src/tools/tool-definitions.js";

for (const api of ["responses", "chat-completions"] as const) {
  test(`${api} declares shared write dictionaries without provider strict-object rejection`, async () => {
    const config = {
      ...assistantConfigFromEnv({
        OPENAI_API_KEY: "test",
        OPENAI_API_MODEL: "test",
      })!,
      api,
    };
    const provider = createAssistantProvider(config, async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      const tools =
        api === "responses"
          ? sent.tools
          : sent.tools.map((tool: { function: unknown }) => tool.function);
      assert.equal(
        tools.find((tool: { name: string }) => tool.name === "create_item")
          .strict,
        false,
      );
      assert.equal(
        tools.find((tool: { name: string }) => tool.name === "update_item")
          .strict,
        false,
      );
      assert.equal(
        tools.find((tool: { name: string }) => tool.name === "read_item")
          .strict,
        true,
      );
      const response =
        api === "responses"
          ? {
              id: "res-test",
              status: "completed",
              output: [
                {
                  type: "message",
                  id: "msg-test",
                  role: "assistant",
                  status: "completed",
                  content: [
                    { type: "output_text", text: "Ready", annotations: [] },
                  ],
                },
              ],
            }
          : {
              id: "chat-test",
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: { role: "assistant", content: "Ready" },
                },
              ],
            };
      return new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
      });
    });
    const answer = await provider(
      parseAssistantInput(
        { messages: [{ role: "user", content: "Hi" }] },
        config,
      ),
      undefined,
      null,
      {
        record: (call) => call(),
        tools: {
          context: {},
          definitions: toolDefinitions,
          proposals: [],
          execute: async () => {
            throw new Error("No tool call expected");
          },
        },
      },
    );
    assert.equal(answer.content, "Ready");
  });
}
