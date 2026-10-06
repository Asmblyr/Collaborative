import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantStreamEvent } from "@asmblyr-collaborative/contracts";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import {
  createAssistantProvider,
  AssistantProviderError,
} from "../src/assistant/provider.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { assistantSse, chatChunk } from "./support/assistant-sse.js";

const config = {
  ...assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!,
  api: "chat-completions" as const,
  zai: true,
};
const input = parseAssistantInput(
  { messages: [{ role: "user", content: "Hello" }] },
  config,
);

test("chat emits public text before completion and retains the final usage chunk", async () => {
  let finish!: () => void;
  const stream = assistantSse();
  let received!: () => void;
  const firstText = new Promise<void>((resolve) => {
    received = resolve;
  });
  const updates: AssistantStreamEvent[] = [];
  const provider = createAssistantProvider(config, async (_url, init) => {
    const sent = JSON.parse(init!.body as string);
    assert.equal(sent.stream, true);
    assert.deepEqual(sent.stream_options, { include_usage: true });
    stream.send(chatChunk({ reasoning_content: "PRIVATE", content: "Привет" }));
    finish = () => {
      stream.send(chatChunk({ content: ", мир" }));
      stream.send(chatChunk({}, "stop"));
      stream.send({
        id: "chat-stream",
        model: "actual-model",
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      });
      stream.end();
    };
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
    { type: "text-delta", delta: "Привет", reset: true },
  ]);
  finish();
  const answer = await pending;
  assert.equal(answer.content, "Привет, мир");
  assert.equal(answer.metadata?.usage.totalTokens, 16);
  assert.equal(answer.metadata?.requestId, "stream-request");
  assert.equal(updates[1].type === "text-delta" && updates[1].reset, false);
  assert.ok(!JSON.stringify(updates).includes("PRIVATE"));
});

test("fragmented tool calls execute only after completion, preserving private reasoning for continuation", async () => {
  let calls = 0;
  let executed = 0;
  const updates: AssistantStreamEvent[] = [];
  const provider = createAssistantProvider(config, async (_url, init) => {
    const sent = JSON.parse(init!.body as string);
    const stream = assistantSse();
    if (calls++ === 0) {
      stream.send(
        chatChunk({ reasoning_content: "PRIVATE", content: "Проверяю…" }),
      );
      stream.send(
        chatChunk({
          tool_calls: [
            {
              index: 0,
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"id":' },
            },
          ],
        }),
      );
      stream.send(
        chatChunk({
          tool_calls: [{ index: 0, function: { arguments: "4}" } }],
        }),
      );
      assert.equal(executed, 0);
      stream.send(chatChunk({}, "tool_calls"));
    } else {
      assert.equal(sent.messages.at(-2).reasoning_content, "PRIVATE");
      assert.equal(sent.messages.at(-1).tool_call_id, "call-1");
      stream.send(chatChunk({ content: "Готово" }, "stop"));
    }
    stream.end();
    return stream.response;
  });
  const answer = await provider(input, undefined, null, {
    record: (call) => call(),
    onText: (event) => updates.push(event),
    onActivity: (activity) => updates.push({ type: "activity", activity }),
    tools: {
      context: {},
      proposals: [],
      definitions: [
        {
          name: "lookup",
          description: "Read",
          parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      execute: async (name, args) => {
        assert.equal(name, "lookup");
        assert.deepEqual(args, { id: 4 });
        executed++;
        return { found: true };
      },
    },
  });
  assert.equal(answer.content, "Готово");
  assert.equal(executed, 1);
  assert.deepEqual(
    updates
      .filter((event) => event.type === "text-delta")
      .map((event) => event.reset),
    [true, true, true],
  );
  assert.ok(
    updates.some(
      (event) =>
        event.type === "activity" && event.activity.text === "Проверяю…",
    ),
  );
  assert.ok(!JSON.stringify(updates).includes("PRIVATE"));
});

test("cancellation after text preserves known metadata without retrying", async () => {
  const controller = new AbortController();
  let calls = 0;
  const provider = createAssistantProvider(config, async (_url, init) => {
    calls++;
    const stream = assistantSse(init?.signal);
    stream.send(chatChunk({ content: "Часть ответа" }));
    return stream.response;
  });
  const text: string[] = [];
  await assert.rejects(
    provider(input, controller.signal, null, {
      record: (call) => call(),
      onText: (event) => {
        text.push(event.delta);
        controller.abort();
      },
    }),
    (error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.equal(error.code, "assistant_cancelled");
      assert.equal(error.metadata?.model, "actual-model");
      assert.equal(error.metadata?.usage.totalTokens, null);
      return true;
    },
  );
  assert.deepEqual(text, ["Часть ответа"]);
  assert.equal(calls, 1);
});

test("early EOF never executes a partial tool call or marks partial text successful", async () => {
  let executed = false;
  const provider = createAssistantProvider(config, async () => {
    const stream = assistantSse();
    stream.send(
      chatChunk({
        content: "Часть",
        tool_calls: [
          {
            index: 0,
            id: "call-1",
            function: { name: "lookup", arguments: "{" },
          },
        ],
      }),
    );
    stream.end();
    return stream.response;
  });
  await assert.rejects(
    provider(input, undefined, null, {
      record: (call) => call(),
      onText: () => {},
      tools: {
        context: {},
        definitions: [],
        proposals: [],
        execute: async () => {
          executed = true;
          return {};
        },
      },
    }),
    { code: "assistant_stream_interrupted" },
  );
  assert.equal(executed, false);
});

test("streamed text respects the existing response limit and marks truncation", async () => {
  const provider = createAssistantProvider(config, async () => {
    const stream = assistantSse();
    stream.send(chatChunk({ content: "x".repeat(7999) }));
    stream.send(chatChunk({ content: "tail" }, "length"));
    stream.end();
    return stream.response;
  });
  let length = 0;
  const answer = await provider(input, undefined, null, {
    record: (call) => call(),
    onText: (event) => {
      length += event.delta.length;
    },
  });
  assert.equal(length, 8000);
  assert.equal(answer.content.length, 8000);
  assert.equal(answer.truncated, true);
});

test("an SSE provider error keeps reported usage but never exposes its raw message", async () => {
  const provider = createAssistantProvider(config, async () => {
    const stream = assistantSse();
    stream.send({
      ...chatChunk({ content: "Часть" }),
      usage: { prompt_tokens: 6, completion_tokens: 2, total_tokens: 8 },
    });
    stream.send({
      error: { message: "PRIVATE upstream error", code: "provider_error" },
    });
    stream.end();
    return stream.response;
  });
  await assert.rejects(
    provider(input, undefined, null, {
      record: (call) => call(),
      onText: () => {},
    }),
    (error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.ok(!error.message.includes("PRIVATE"));
      assert.equal(error.metadata?.model, "actual-model");
      assert.equal(error.metadata?.usage.totalTokens, 8);
      return true;
    },
  );
});
