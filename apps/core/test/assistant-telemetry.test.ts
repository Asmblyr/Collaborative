import assert from "node:assert/strict";
import test from "node:test";
import type { Knex } from "knex";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import {
  createAssistantProvider,
  AssistantProviderError,
} from "../src/assistant/provider.js";
import { AssistantService } from "../src/assistant/service.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { responseMetadata } from "../src/assistant/telemetry/usage.js";
import { createAssistantJournal } from "../src/assistant/telemetry/journal.js";
import { parseTelemetryQuery } from "../src/assistant/telemetry/query.js";

const config = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test-model",
})!;
const body = { messages: [{ role: "user", content: "private test prompt" }] };

test("both API formats normalize usage without estimating or double counting subsets", () => {
  const common = {
    id: "response-1",
    model: "actual-model",
    request_id: "zai-request",
    _request_id: "http-request",
  };
  const expected = {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    cachedTokens: 10,
    reasoningTokens: 5,
  };
  assert.deepEqual(
    responseMetadata(
      {
        ...common,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: { cached_tokens: 10 },
          output_tokens_details: { reasoning_tokens: 5 },
        },
      },
      "responses",
    ).usage,
    expected,
  );
  const chat = responseMetadata(
    {
      ...common,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 10 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    },
    "chat-completions",
  );
  assert.deepEqual(chat.usage, expected);
  assert.equal(chat.model, "actual-model");
  assert.equal(chat.requestId, "http-request");
  const missing = responseMetadata(
    {
      usage: {
        input_tokens: 0,
        output_tokens: "12",
        total_tokens: -2,
        input_tokens_details: { cached_tokens: 1.5 },
        output_tokens_details: { reasoning_tokens: Infinity },
      },
    },
    "responses",
  );
  assert.deepEqual(missing.usage, {
    inputTokens: 0,
    outputTokens: null,
    totalTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
  });
  assert.equal(
    responseMetadata(
      { usage: { input_tokens: 2 ** 32 }, model: "x".repeat(257), id: "bad\0" },
      "responses",
    ).model,
    null,
  );
  assert.equal(responseMetadata(null, "responses").usage.totalTokens, null);
});

test("successful, truncated, empty and failed provider output preserve usage before content validation", async () => {
  for (const api of ["responses", "chat-completions"] as const) {
    for (const mode of ["success", "truncated", "empty", "failed"] as const) {
      const selected = { ...config, api };
      const content =
        mode === "empty" || mode === "failed" ? "" : "private response";
      const provider = createAssistantProvider(selected, async () =>
        Response.json(
          api === "responses"
            ? {
                object: "response",
                id: "response-id",
                model: "actual-model",
                status:
                  mode === "failed"
                    ? "failed"
                    : mode === "truncated"
                      ? "incomplete"
                      : "completed",
                output: [
                  {
                    type: "message",
                    content: [{ type: "output_text", text: content }],
                  },
                ],
                usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
              }
            : {
                id: "response-id",
                model: "actual-model",
                choices: [
                  {
                    message: { content },
                    finish_reason: mode === "truncated" ? "length" : "stop",
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              },
          { headers: { "x-request-id": "http-id" } },
        ),
      );
      if (!content)
        await assert.rejects(
          provider(parseAssistantInput(body, selected)),
          (error) => {
            assert.ok(error instanceof AssistantProviderError);
            assert.equal(error.metadata?.usage.totalTokens, 15);
            return true;
          },
        );
      else {
        const answer = await provider(parseAssistantInput(body, selected));
        assert.equal(answer.metadata?.model, "actual-model");
        assert.equal(answer.metadata?.requestId, "http-id");
        assert.equal(answer.metadata?.usage.totalTokens, 15);
        assert.equal(answer.truncated, mode === "truncated");
      }
    }
  }
});

test("journal refuses an unrecorded attempt and preserves answers when finalization fails", async () => {
  let invoked = 0,
    starts = 0,
    finishes = 0;
  const warnings: string[] = [];
  let failStart = true;
  const query = {
    withSchema: () => query,
    where: () => query,
    insert: () => ({
      timeout: async () => {
        starts++;
        if (failStart) throw new Error("private DB error");
      },
    }),
    update: () => ({
      timeout: async () => {
        finishes++;
        throw new Error("private finish error");
      },
    }),
  };
  const journal = createAssistantJournal(
    (() => query) as unknown as Knex,
    (id) => warnings.push(id),
  );
  const generate = async () => {
    invoked++;
    return { content: "answer", truncated: false };
  };
  const service = new AssistantService(config, generate);
  await assert.rejects(
    service.respond("user", body, undefined, undefined, journal),
    {
      code: "assistant_telemetry_unavailable",
    },
  );
  assert.equal(invoked, 0);
  assert.equal(finishes, 0);
  failStart = false;
  const answer = await service.respond(
    "user",
    body,
    undefined,
    undefined,
    journal,
  );
  assert.equal(answer.content, "answer");
  assert.equal(answer.truncated, false);
  assert.equal(answer.summary.modelCalls, 1);
  assert.equal(answer.summary.usage.inputTokens, null);
  assert.equal(invoked, 1);
  assert.equal(starts, 3);
  assert.equal(finishes, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /^[a-f0-9-]{36}$/);
  await assert.rejects(
    service.respond("user", { bad: "input" }, undefined, undefined, journal),
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    service.respond("user", body, abort.signal, undefined, journal),
    {
      code: "assistant_cancelled",
    },
  );
  assert.equal(starts, 3);
});

test("malformed output retains known usage; HTTP errors retain safe request identifiers", async () => {
  const malformed = createAssistantProvider(
    { ...config, api: "chat-completions" },
    async () =>
      Response.json({
        model: "actual",
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        choices: null,
      }),
  );
  await assert.rejects(
    malformed(parseAssistantInput(body, config)),
    (error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.equal(error.metadata?.usage.totalTokens, 12);
      return true;
    },
  );
  const rejected = createAssistantProvider(config, async () =>
    Response.json(
      { error: { message: "private provider error" } },
      { status: 429, headers: { "x-request-id": "failure-request" } },
    ),
  );
  await assert.rejects(rejected(parseAssistantInput(body, config)), (error) => {
    assert.ok(error instanceof AssistantProviderError);
    assert.equal(error.metadata?.requestId, "failure-request");
    assert.equal(error.metadata?.usage.totalTokens, null);
    assert.ok(!JSON.stringify(error).includes("private"));
    return true;
  });
});

test("telemetry query restricts periods, cursors and identifiers", () => {
  for (const invalid of [
    { days: "all" },
    { days: ["7"] },
    { userId: "x' OR 1=1" },
    { cursor: "!" },
    { cursor: Buffer.from("invalid|id").toString("base64url") },
    { until: "2026-02-30T00:00:00.000Z" },
    { until: "2999-01-01T00:00:00.000Z" },
    { limit: "99999" },
  ]) {
    assert.throws(() => parseTelemetryQuery(invalid));
  }
  assert.equal(parseTelemetryQuery({}).days, 7);
});
