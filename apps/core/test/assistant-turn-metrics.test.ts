import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import {
  createAssistantProvider,
  AssistantProviderError,
} from "../src/assistant/provider.js";
import { AssistantService } from "../src/assistant/service.js";
import { AssistantTurnMetrics } from "../src/assistant/telemetry/turn-metrics.js";
import { responseMetadata } from "../src/assistant/telemetry/usage.js";

const config = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test",
  OPENAI_API_MODE: "chat-completions",
})!;
const body = { messages: [{ role: "user", content: "test" }] };

test("incomplete tool calls never execute and retain reported usage", async () => {
  let executed = 0;
  const provider = createAssistantProvider(config, async () =>
    Response.json({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: null,
            tool_calls: [
              {
                id: "call",
                type: "function",
                function: {
                  name: "describe_collection",
                  arguments: '{"collection":',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
  );
  const service = new AssistantService(config, provider);
  await assert.rejects(
    service.respond(
      "user",
      body,
      undefined,
      undefined,
      undefined,
      async () => ({
        context: {},
        definitions: [],
        proposals: [],
        execute: async () => {
          executed++;
          return {};
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.equal(error.code, "assistant_tool_truncated");
      assert.equal(error.summary?.modelCalls, 1);
      assert.equal(error.summary?.toolCalls, 0);
      assert.equal(error.summary?.usage.totalTokens, 30);
      return true;
    },
  );
  assert.equal(executed, 0);
});

test("the whole-turn timeout still stops tool continuations without another model call", async () => {
  let calls = 0;
  const provider = createAssistantProvider(
    { ...config, timeoutMs: 30 },
    async () => {
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call",
                  type: "function",
                  function: { name: "describe_collection", arguments: "{}" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      });
    },
  );
  const service = new AssistantService(config, provider);
  await assert.rejects(
    service.respond(
      "user",
      body,
      undefined,
      undefined,
      undefined,
      async () => ({
        context: {},
        definitions: [],
        proposals: [],
        execute: async (_name, _args, signal) => {
          await setTimeout(60);
          assert.equal(signal?.aborted, true);
          return {};
        },
      }),
    ),
    (error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.equal(error.code, "assistant_timeout");
      assert.equal(error.summary?.modelCalls, 1);
      assert.equal(error.summary?.toolCalls, 1);
      assert.equal(error.summary?.usage.totalTokens, 12);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("usage aggregates known failure metadata, missing counters and genuine zero separately", async () => {
  const metrics = new AssistantTurnMetrics("turn", "requested");
  await metrics.recordModel(async () => ({
    content: "ok",
    truncated: false,
    metadata: responseMetadata(
      {
        model: "actual",
        usage: { input_tokens: 0, output_tokens: 2, total_tokens: 2 },
      },
      "responses",
    ),
  }));
  await assert.rejects(
    metrics.recordModel(async () => {
      throw new AssistantProviderError(
        502,
        "assistant_empty_response",
        "safe",
        responseMetadata(
          { model: "actual", usage: { input_tokens: 10 } },
          "responses",
        ),
      );
    }),
  );
  await assert.rejects(
    metrics.recordModel(async () => {
      throw new Error("private failure");
    }),
  );
  await assert.rejects(
    metrics.recordTool(async () => {
      throw new Error("private tool arguments");
    }),
  );
  const summary = metrics.finish("failed", "assistant_internal_error");
  assert.equal(summary.modelCalls, 3);
  assert.equal(summary.toolCalls, 1);
  assert.equal(summary.toolErrors, 1);
  assert.deepEqual(summary.usage, {
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 2,
    cachedTokens: null,
    reasoningTokens: null,
  });
  assert.deepEqual(summary.usageSamples, {
    inputTokens: 2,
    outputTokens: 1,
    totalTokens: 1,
    cachedTokens: 0,
    reasoningTokens: 0,
  });
  assert.ok(!JSON.stringify(summary).includes("private"));
});
