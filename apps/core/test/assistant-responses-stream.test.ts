import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantStreamEvent } from "@asmblyr-collaborative/contracts";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { assistantSse } from "./support/assistant-sse.js";

const config = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test",
})!;
const input = parseAssistantInput(
  { messages: [{ role: "user", content: "Hello" }] },
  config,
);

for (const refusal of [false, true]) {
  test(`Responses streams ${refusal ? "refusals" : "text"} before the terminal event with final usage`, async () => {
    const stream = assistantSse();
    let received!: () => void;
    const firstText = new Promise<void>((resolve) => {
      received = resolve;
    });
    const updates: AssistantStreamEvent[] = [];
    const provider = createAssistantProvider(config, async (_url, init) => {
      const sent = JSON.parse(init!.body as string);
      assert.equal(sent.stream, true);
      assert.equal(sent.store, false);
      stream.send({
        type: "response.created",
        response: {
          id: "response-1",
          model: "actual",
          status: "in_progress",
          output: [],
        },
      });
      stream.send({ type: "response.reasoning_text.delta", delta: "PRIVATE" });
      stream.send({
        type: refusal ? "response.refusal.delta" : "response.output_text.delta",
        delta: "Ответ",
      });
      return stream.response;
    });
    let settled = false;
    const pending = provider(input, undefined, null, {
      record: (call) => call(),
      onText: (event) => {
        updates.push(event);
        received();
      },
    }).finally(() => {
      settled = true;
    });
    await firstText;
    assert.equal(settled, false);
    assert.deepEqual(updates, [
      { type: "text-delta", delta: "Ответ", reset: true },
    ]);
    stream.send({
      type: "response.completed",
      response: {
        id: "response-1",
        model: "actual",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              refusal
                ? { type: "refusal", refusal: "Ответ" }
                : { type: "output_text", text: "Ответ" },
            ],
          },
        ],
        usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12 },
      },
    });
    stream.end();
    const answer = await pending;
    assert.equal(answer.content, "Ответ");
    assert.equal(answer.metadata?.usage.totalTokens, 12);
    assert.equal(answer.metadata?.requestId, "stream-request");
  });
}

test("Responses tool continuation retains encrypted reasoning and receives complete arguments", async () => {
  let calls = 0;
  let executed = 0;
  const provider = createAssistantProvider(config, async (_url, init) => {
    const sent = JSON.parse(init!.body as string);
    const stream = assistantSse();
    const first = calls++ === 0;
    if (!first) {
      assert.ok(JSON.stringify(sent.input).includes("encrypted-private"));
      assert.equal(sent.input.at(-1).call_id, "tool-1");
      stream.send({ type: "response.output_text.delta", delta: "Готово" });
    } else {
      stream.send({
        type: "response.function_call_arguments.delta",
        delta: '{"id":',
      });
    }
    stream.send({
      type: "response.completed",
      response: {
        id: `r-${calls}`,
        model: "actual",
        status: "completed",
        output: first
          ? [
              {
                type: "reasoning",
                id: "reason-1",
                summary: [],
                encrypted_content: "encrypted-private",
              },
              {
                type: "function_call",
                call_id: "tool-1",
                name: "lookup",
                arguments: '{"id":4}',
              },
            ]
          : [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "Готово" }],
              },
            ],
      },
    });
    stream.end();
    return stream.response;
  });
  const updates: AssistantStreamEvent[] = [];
  const result = await provider(input, undefined, null, {
    record: (call) => call(),
    onText: (event) => updates.push(event),
    tools: {
      context: {},
      proposals: [],
      definitions: [],
      execute: async (_name, args) => {
        assert.deepEqual(args, { id: 4 });
        executed++;
        return { ok: true };
      },
    },
  });
  assert.equal(executed, 1);
  assert.equal(result.content, "Готово");
  assert.deepEqual(updates, [
    { type: "text-delta", delta: "Готово", reset: true },
  ]);
});

test("Responses distinguishes truncated output from a prematurely closed stream", async () => {
  for (const completed of [true, false]) {
    const provider = createAssistantProvider(config, async () => {
      const stream = assistantSse();
      stream.send({ type: "response.output_text.delta", delta: "Часть" });
      if (completed) {
        stream.send({
          type: "response.incomplete",
          response: {
            id: "r",
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "Часть" }],
              },
            ],
          },
        });
      }
      stream.end();
      return stream.response;
    });
    const pending = provider(input, undefined, null, {
      record: (call) => call(),
      onText: () => {},
    });
    if (completed) {
      assert.equal((await pending).truncated, true);
    } else {
      await assert.rejects(pending, { code: "assistant_stream_interrupted" });
    }
  }
});
