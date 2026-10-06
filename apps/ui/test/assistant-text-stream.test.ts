import assert from "node:assert/strict";
import test from "node:test";
import { AssistantRequest } from "../src/components/assistant/assistant-stream";
import { replaceTurnMessage } from "../src/components/assistant/assistant-turn-message";
import {
  conversationInput,
  type AssistantMessage,
} from "../src/components/assistant/assistant-types";

function eventStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return {
    response: new Response(body, {
      headers: { "content-type": "application/x-ndjson" },
    }),
    send(event: object) {
      controller.enqueue(
        new TextEncoder().encode(`${JSON.stringify(event)}\n`),
      );
    },
    end() {
      controller.close();
    },
  };
}

test("text is visible before the response finishes and the final result replaces the same message", async (t) => {
  const stream = eventStream();
  t.mock.method(globalThis, "fetch", async () => stream.response);
  const request = new AssistantRequest();
  let messages: AssistantMessage[] = [
    { id: "user", role: "user", content: "Hello" },
  ];
  let received!: () => void;
  const firstText = new Promise<void>((resolve) => {
    received = resolve;
  });
  let settled = false;
  const pending = request
    .send(
      {},
      () => {},
      (text) => {
        messages = replaceTurnMessage(messages, {
          id: "reply",
          role: "assistant",
          content: text,
          streaming: true,
        });
        received();
      },
    )
    .finally(() => {
      settled = true;
    });
  stream.send({ type: "text-delta", delta: "Привет", reset: true });
  await firstText;
  assert.equal(settled, false);
  assert.equal(messages.at(-1)?.content, "Привет");
  stream.send({ type: "text-delta", delta: ", мир", reset: false });
  stream.send({
    type: "answer",
    data: { content: "Привет, мир", truncated: false, proposals: [] },
  });
  stream.end();
  const result = await pending;
  messages = replaceTurnMessage(messages, {
    id: "reply",
    role: "assistant",
    content: result.content,
    truncated: result.truncated,
    summary: result.summary,
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "Привет, мир");
  assert.equal(messages[1].streaming, undefined);
});

test("provisional work notes stay separate when the network ends", async (t) => {
  const stream = eventStream();
  t.mock.method(globalThis, "fetch", async () => stream.response);
  const request = new AssistantRequest();
  const rendered: string[] = [];
  const pending = request.send(
    {},
    () => {},
    (text) => rendered.push(text),
  );
  stream.send({
    type: "text-delta",
    delta: "Проверяю…",
    reset: true,
    provisional: true,
  });
  stream.send({
    type: "activity",
    activity: { kind: "note", text: "Проверяю…" },
  });
  stream.send({ type: "text-delta", delta: "Результат: ", reset: true });
  stream.send({ type: "text-delta", delta: "4", reset: false });
  stream.end();
  await assert.rejects(pending, /Соединение прервалось/);
  assert.equal(request.text, "Результат: 4");
  assert.deepEqual(request.activity, [{ kind: "note", text: "Проверяю…" }]);
  assert.equal(rendered.at(-1), request.text);
});

test("a calculator explanation survives presentation and finalization exactly once", async (t) => {
  const stream = eventStream();
  t.mock.method(globalThis, "fetch", async () => stream.response);
  const request = new AssistantRequest();
  const explanation =
    "10 × 100 ₽ × 12 месяцев = 12 000 ₽. Со скидкой 10%: 10 800 ₽.";
  const finalText = "Расчёт готов. Значения можно изменить на странице.";
  const content = `${explanation}\n\n${finalText}`;
  const pluginResults = [{ draftId: "calculation", namespace: "calculator" }];
  let visible = "";
  let received!: () => void;
  const beforePresentation = new Promise<void>((resolve) => {
    received = resolve;
  });
  const pending = request.send(
    {},
    () => {},
    (text) => {
      visible = text;
      received();
    },
  );

  stream.send({ type: "text-delta", delta: explanation, reset: true });
  await beforePresentation;
  assert.equal(visible, explanation);
  stream.send({
    type: "progress",
    progress: {
      phase: "tool",
      label: "Готовлю заполненную форму",
      modelCalls: 2,
      toolCalls: 2,
    },
  });
  stream.send({ type: "text-delta", delta: finalText, reset: true });
  stream.send({
    type: "answer",
    data: { content, pluginResults, truncated: false },
  });
  stream.end();

  const result = await pending;
  assert.equal(visible, content);
  assert.equal(result.content, content);
  assert.equal(result.content.split(explanation).length - 1, 1);
  assert.deepEqual(result.pluginResults, pluginResults);
});

test("stop preserves pending text and retains cancellation statistics", async (t) => {
  const stream = eventStream();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/cancel")) {
      stream.send({
        type: "error",
        code: "assistant_cancelled",
        message: "Stopped",
        summary: { modelCalls: 1 },
      });
      stream.end();
      return Response.json({ data: { stopping: true } });
    }
    return stream.response;
  });
  const request = new AssistantRequest();
  let rendered = "";
  const pending = request.send(
    {},
    () => {},
    (text) => {
      rendered = text;
    },
  );
  stream.send({ type: "started", requestId: "owned" });
  stream.send({ type: "text-delta", delta: "Расчёт: 100 ₽", reset: true });
  stream.send({ type: "text-delta", delta: "Часть ответа", reset: true });
  request.stop();
  await assert.rejects(pending, {
    code: "assistant_cancelled",
    summary: { modelCalls: 1 },
  });
  assert.equal(rendered, "Часть ответа");
  assert.equal(request.text, rendered);
});

test("long multi-step replies stay visible while follow-up history fits the input budget", () => {
  const content = `${"Ранние пояснения. ".repeat(1000)}\n\nИтого: 10 800 ₽.`;
  const messages: AssistantMessage[] = [
    { id: "user", role: "user", content: "Рассчитай" },
    { id: "reply", role: "assistant", content },
  ];
  const history = conversationInput(messages, "А за полгода?", {
    available: true,
    limits: {
      maxMessages: 10,
      maxMessageChars: 8000,
      maxConversationChars: 32000,
    },
  });

  assert.equal(history.length, 3);
  assert.equal(history[1].content.length, 8000);
  assert.ok(history[1].content.endsWith("Итого: 10 800 ₽."));
  assert.equal(messages[1].content, content);
});

test("incomplete streamed turns remain visible but never become completed model history", () => {
  for (const state of [
    { failed: true },
    { cancelled: true },
    { streaming: true },
  ]) {
    const messages: AssistantMessage[] = [
      { id: "1", role: "user", content: "Previous" },
      { id: "2", role: "assistant", content: "Complete" },
      { id: "3", role: "user", content: "Interrupted" },
      { id: "4", role: "assistant", content: "Partial", ...state },
    ];
    assert.deepEqual(
      conversationInput(messages, "Next", {
        available: true,
        limits: {
          maxMessages: 10,
          maxMessageChars: 100,
          maxConversationChars: 1000,
        },
      }),
      [
        { role: "user", content: "Previous" },
        { role: "assistant", content: "Complete" },
        { role: "user", content: "Next" },
      ],
    );
    assert.equal(messages[3].content, "Partial");
  }
});
