import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { parseAssistantContext } from "../src/assistant/context-input.js";
import {
  contextToolDefinitions,
  type AssistantTools,
} from "../src/assistant/tool-contract.js";

const base = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test-model",
})!;
const input = parseAssistantInput(
  { messages: [{ role: "user", content: "Suggest a filter" }] },
  base,
);

for (const api of ["responses", "chat-completions"] as const) {
  test(`${api}: a looping model stops at eight calls and oversized context makes no request`, async () => {
    let calls = 0;
    const provider = createAssistantProvider({ ...base, api }, async () => {
      calls++;
      return Response.json(
        api === "responses"
          ? {
              object: "response",
              status: "completed",
              output: [
                {
                  type: "function_call",
                  id: `f${calls}`,
                  call_id: `c${calls}`,
                  name: "describe_collection",
                  arguments: "{}",
                },
              ],
            }
          : {
              choices: [
                {
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        type: "function",
                        id: `c${calls}`,
                        function: {
                          name: "describe_collection",
                          arguments: "{}",
                        },
                      },
                    ],
                  },
                },
              ],
            },
      );
    });
    await assert.rejects(
      provider(input, undefined, null, {
        record: (fn) => fn(),
        tools: {
          context: {},
          definitions: contextToolDefinitions,
          proposals: [],
          execute: async () => ({ ok: true }),
        },
      }),
      { code: "assistant_step_limit" },
    );
    assert.equal(calls, 8);
    calls = 0;
    await assert.rejects(provider(input, undefined, "x".repeat(100001)), {
      code: "assistant_context_limit",
    });
    assert.equal(calls, 0);
  });
}

test("context accepts only a bounded page snapshot, never rows, principal or tools", () => {
  assert.equal(parseAssistantContext(null), null);
  const context = {
    page: "items",
    workspaceId: null,
    collection: "posts",
    table: {
      page: 1,
      size: 25,
      sort: "id",
      direction: "asc",
      q: "",
      filter: "",
      selectedCount: 3,
      editorOpen: false,
    },
  };
  assert.deepEqual(parseAssistantContext(context), context);
  for (const invalid of [
    { ...context, rows: [] },
    { ...context, principal: { superuser: true } },
    { ...context, page: "https://evil.test" },
    { ...context, collection: "asmblyr_users" },
    { ...context, table: { ...context.table, filter: "x".repeat(8193) } },
    { ...context, table: { ...context.table, selectedCount: 101 } },
    { ...context, table: { ...context.table, draft: "private" } },
    { ...context, page: "files" },
  ]) {
    assert.throws(() => parseAssistantContext(invalid));
  }
});

for (const api of ["responses", "chat-completions"] as const)
  test(`${api}: tool loop preserves public explanations, private reasoning, call IDs and usage`, async () => {
    let calls = 0,
      recorded = 0;
    const names: string[] = [];
    const config = { ...base, api, zai: api === "chat-completions" };
    const tools: AssistantTools = {
      context: { page: "items", collection: "posts" },
      definitions: contextToolDefinitions,
      proposals: [],
      execute: async (name, args) => {
        names.push(name);
        assert.equal(typeof args, "object");
        return { ok: true };
      },
    };
    const provider = createAssistantProvider(config, async (_url, options) => {
      const sent = JSON.parse(options!.body as string);
      const i = calls++;
      assert.equal(sent.tools.length, 9);
      if (i > 0) {
        const history = api === "responses" ? sent.input : sent.messages;
        assert.ok(
          JSON.stringify(history).includes(
            api === "responses" ? "encrypted-reasoning" : "private-reasoning",
          ),
        );
        assert.ok(
          history.some(
            (item: Record<string, unknown>) =>
              (item.call_id === "call-0" &&
                item.type === "function_call_output") ||
              item.tool_call_id === "call-0",
          ),
        );
      }
      const name = i === 0 ? "describe_collection" : "propose_filter";
      const args =
        i === 0
          ? "{}"
          : JSON.stringify({ filter: '{"logic":"and","children":[]}' });
      return Response.json(
        api === "responses"
          ? {
              object: "response",
              status: "completed",
              model: "actual",
              id: `r-${i}`,
              output:
                i < 7
                  ? [
                      {
                        type: "reasoning",
                        id: `reason-${i}`,
                        summary: [],
                        encrypted_content: "encrypted-reasoning",
                      },
                      {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: `Step ${i}` }],
                      },
                      {
                        type: "function_call",
                        call_id: `call-${i}`,
                        name,
                        arguments: args,
                      },
                    ]
                  : [
                      {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: "Ready" }],
                      },
                    ],
              usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            }
          : {
              model: "actual",
              choices: [
                {
                  finish_reason: i < 7 ? "tool_calls" : "stop",
                  message: {
                    role: "assistant",
                    content: i < 7 ? `Step ${i}` : "Ready",
                    reasoning_content: "private-reasoning",
                    ...(i < 7
                      ? {
                          tool_calls: [
                            {
                              id: `call-${i}`,
                              type: "function",
                              function: { name, arguments: args },
                            },
                          ],
                        }
                      : {}),
                  },
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            },
      );
    });
    const result = await provider(input, undefined, null, {
      tools,
      record: async (fn) => {
        recorded++;
        const answer = await fn();
        assert.equal(answer.metadata?.usage.totalTokens, 15);
        return answer;
      },
    });
    assert.equal(
      result.content,
      [
        ...Array.from({ length: 7 }, (_, index) => `Step ${index}`),
        "Ready",
      ].join("\n\n"),
    );
    assert.equal(calls, 8);
    assert.equal(recorded, 8);
    assert.deepEqual(names, [
      "describe_collection",
      ...Array(6).fill("propose_filter"),
    ]);
    assert.ok(!JSON.stringify(result).includes("private-reasoning"));
    assert.ok(!JSON.stringify(result).includes("encrypted-reasoning"));
  });

test("invalid arguments are never executed and cancellation stops repeated calls", async () => {
  const controller = new AbortController();
  let calls = 0,
    executed = 0;
  const provider = createAssistantProvider(
    { ...base, api: "chat-completions" },
    async () => {
      calls++;
      if (calls === 8) controller.abort();
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: String(calls),
                  type: "function",
                  function: {
                    name: "describe_collection",
                    arguments: "invalid JSON",
                  },
                },
              ],
            },
          },
        ],
      });
    },
  );
  await assert.rejects(
    provider(input, controller.signal, null, {
      record: (fn) => fn(),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async () => {
          executed++;
          return {};
        },
      },
    }),
    { code: "assistant_cancelled" },
  );
  assert.equal(calls, 8);
  assert.equal(executed, 0);
});

test("cancellation between tool steps prevents another provider call", async () => {
  const controller = new AbortController();
  let calls = 0;
  const provider = createAssistantProvider(
    { ...base, api: "chat-completions" },
    async () => {
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "one",
                  type: "function",
                  function: { name: "describe_collection", arguments: "{}" },
                },
              ],
            },
          },
        ],
      });
    },
  );
  await assert.rejects(
    provider(input, controller.signal, null, {
      record: (fn) => fn(),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async () => {
          controller.abort();
          return {};
        },
      },
    }),
    { code: "assistant_cancelled" },
  );
  assert.equal(calls, 1);
});
