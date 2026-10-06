import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { AssistantService } from "../src/assistant/service.js";
import {
  contextToolDefinitions,
  type AssistantTools,
} from "../src/assistant/tool-contract.js";

const base = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test",
})!;
const input = {
  messages: [{ role: "user" as const, content: "Read related categories" }],
  thinking: false,
  reasoningEffort: null,
};

function answer(
  api: "responses" | "chat-completions",
  call: number,
  args: object | null,
  name = "describe_collection",
) {
  const content = args ? null : "Only verified results; the rest is unknown.";
  if (api === "responses") {
    return Response.json({
      object: "response",
      status: "completed",
      output: args
        ? [
            {
              type: "function_call",
              call_id: String(call),
              name,
              arguments: JSON.stringify(args),
            },
          ]
        : [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: content }],
            },
          ],
    });
  }
  return Response.json({
    choices: [
      {
        finish_reason: args ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content,
          ...(args
            ? {
                tool_calls: [
                  {
                    type: "function",
                    id: String(call),
                    function: { name, arguments: JSON.stringify(args) },
                  },
                ],
              }
            : {}),
        },
      },
    ],
  });
}

function tools(execute: AssistantTools["execute"]): AssistantTools {
  return {
    context: {},
    definitions: contextToolDefinitions,
    proposals: [],
    execute,
  };
}

for (const [api, zai] of [
  ["responses", false],
  ["chat-completions", false],
  ["chat-completions", true],
] as const) {
  test(`${api} zai=${zai}: reserves the last call and never executes a final-step tool`, async () => {
    let calls = 0;
    let executed = 0;
    const provider = createAssistantProvider(
      { ...base, api, zai },
      async (_url, options) => {
        const sent = JSON.parse(options!.body as string);
        calls++;
        if (calls === 8) {
          if (zai) {
            assert.equal(sent.tools, undefined);
            assert.equal(sent.tool_choice, undefined);
          } else assert.equal(sent.tool_choice, "none");
          assert.ok(JSON.stringify(sent).includes("итоговый ответ"));
        }
        return answer(api, calls, { collection: "categories" });
      },
    );
    await assert.rejects(
      provider(input, undefined, null, {
        record: (fn) => fn(),
        tools: tools(async () => {
          executed++;
          return { ok: true };
        }),
      }),
      { code: "assistant_step_limit" },
    );
    assert.equal(calls, 8);
    assert.equal(executed, 7);
  });

  test(`${api} zai=${zai}: repeated failed arguments are blocked even with reordered keys`, async () => {
    let calls = 0;
    let executed = 0;
    const provider = createAssistantProvider(
      { ...base, api, zai },
      async (_url, options) => {
        calls++;
        const sent = JSON.parse(options!.body as string);
        if (calls === 3) {
          const wire = JSON.stringify(
            api === "responses" ? sent.input : sent.messages,
          );
          assert.ok(wire.includes("REPEATED_TOOL_ERROR"));
          assert.equal(
            zai ? sent.tools : sent.tool_choice,
            zai ? undefined : "none",
          );
        }
        return answer(
          api,
          calls,
          calls < 3
            ? calls === 1
              ? { collection: "categories", fields: ["alias"] }
              : { fields: ["alias"], collection: "categories" }
            : null,
        );
      },
    );
    const result = await provider(input, undefined, null, {
      record: (fn) => fn(),
      tools: tools(async () => {
        executed++;
        return { code: "INVALID_ARGUMENTS", error: "Use readable fields" };
      }),
    });
    assert.equal(calls, 3);
    assert.equal(executed, 1);
    assert.equal(result.content, "Only verified results; the rest is unknown.");
  });

  test(`${api} zai=${zai}: corrected arguments can recover after a validation error`, async () => {
    let calls = 0;
    let executed = 0;
    const provider = createAssistantProvider(
      { ...base, api, zai },
      async (_url, options) => {
        const sent = JSON.parse(options!.body as string);
        calls++;
        assert.ok(sent.tools.length > 0);
        return answer(
          api,
          calls,
          calls < 3 ? { collection: calls === 1 ? "old" : "categories" } : null,
        );
      },
    );
    await provider(input, undefined, null, {
      record: (fn) => fn(),
      tools: tools(async (_name, args) => {
        executed++;
        return (args as { collection: string }).collection === "old"
          ? { error: "Schema required", code: "SCHEMA_REQUIRED" }
          : { ok: true };
      }),
    });
    assert.equal(calls, 3);
    assert.equal(executed, 2);
  });
}

test("compaction consumes the shared budget; the eighth call finalizes after six tools", async () => {
  let calls = 0;
  let executed = 0;
  const config = { ...base, api: "chat-completions" as const, zai: true };
  const provider = createAssistantProvider(config, async (_url, options) => {
    const sent = JSON.parse(options!.body as string);
    calls++;
    if (calls === 8) assert.equal(sent.tools, undefined);
    return answer(
      config.api,
      calls,
      calls > 1 && calls < 8 ? { collection: "categories" } : null,
    );
  });
  const service = new AssistantService(config, provider);
  const result = await service.respond(
    "user",
    { messages: input.messages },
    undefined,
    undefined,
    undefined,
    async () =>
      tools(async () => {
        executed++;
        return { ok: true };
      }),
    undefined,
    undefined,
    async (history, summarize) => {
      await summarize("Old conversation");
      return history;
    },
  );
  assert.equal(calls, 8);
  assert.equal(executed, 6);
  assert.equal(result.summary.modelCalls, 8);
  assert.equal(result.summary.toolCalls, 6);
  assert.equal(result.summary.status, "succeeded");
});

test("telemetry records only advertised names and safe codes, never argument or result data", async () => {
  let calls = 0;
  const config = { ...base, api: "chat-completions" as const };
  const provider = createAssistantProvider(config, async () => {
    calls++;
    return answer(
      config.api,
      calls,
      calls < 3 ? { secret: "private-input" } : null,
      "private-tool-name",
    );
  });
  const result = await new AssistantService(config, provider).respond(
    "user",
    { messages: input.messages },
    undefined,
    undefined,
    undefined,
    async () =>
      tools(async () => ({
        error: "private-exception",
        code: "private-code",
        result: "private-result",
      })),
  );
  assert.equal(result.summary.toolErrors, 2);
  assert.deepEqual(
    result.summary.toolTrace?.map(({ name, errorCode }) => ({
      name,
      errorCode,
    })),
    [
      { name: "unknown", errorCode: "TOOL_ERROR" },
      { name: "unknown", errorCode: "REPEATED_TOOL_ERROR" },
    ],
  );
  assert.ok(!JSON.stringify(result.summary).includes("private-"));
});
