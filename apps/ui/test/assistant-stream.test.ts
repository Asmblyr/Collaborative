import assert from "node:assert/strict";
import test from "node:test";
import {
  readAssistantEvents,
  AssistantRequest,
} from "../src/components/assistant/assistant-stream";
import { selectionHref } from "../src/components/assistant/selection-location";
import { conversationInput } from "../src/components/assistant/assistant-types";

test("stream decoder handles split UTF-8/JSON and refuses an incomplete final event", async () => {
  const event = { type: "error", code: "test", message: "Пример" };
  const bytes = new TextEncoder().encode(JSON.stringify(event) + "\n");
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const events = [];
  for await (const value of readAssistantEvents(
    new Response(body, { headers: { "content-type": "application/x-ndjson" } }),
  ))
    events.push(value);
  assert.deepEqual(events, [event]);
  await assert.rejects(async () => {
    for await (const event of readAssistantEvents(
      new Response('{"type":', {
        headers: { "content-type": "application/x-ndjson" },
      }),
    ))
      void event;
  }, /оборвался/);
});

test("Stop before started is delivered once without closing the answer stream", async (t) => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let stops = 0;
  const request = new AssistantRequest();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/cancel")) {
      stops++;
      stream.enqueue(
        new TextEncoder().encode(
          JSON.stringify({
            type: "error",
            code: "assistant_cancelled",
            message: "Stopped",
          }) + "\n",
        ),
      );
      stream.close();
      return Response.json({ data: { stopping: true } });
    }
    return new Response(
      new ReadableStream({
        start(controller) {
          stream = controller;
        },
      }),
      { headers: { "content-type": "application/x-ndjson" } },
    );
  });
  const pending = request.send({}, () => {});
  request.stop();
  request.stop();
  stream.enqueue(
    new TextEncoder().encode('{"type":"started","requestId":"owned"}\n'),
  );
  await assert.rejects(pending, { code: "assistant_cancelled" });
  assert.equal(stops, 1);
  assert.equal(request.controller.signal.aborted, false);
});

test("selection navigation preserves exact conditions and overrides saved/default filters", () => {
  const filter = { logic: "and", children: [] };
  const href = selectionHref({
    collection: "other",
    q: "a & b",
    filter,
    sort: "title",
    direction: "desc",
    order: "relevance",
  });
  const url = new URL(href, "https://test.invalid");
  assert.equal(url.pathname, "/items/other");
  assert.equal(url.searchParams.get("q"), "a & b");
  assert.equal(url.searchParams.get("page"), "1");
  assert.deepEqual(JSON.parse(url.searchParams.get("filter")!), filter);
  assert.equal(url.searchParams.get("direction"), "desc");
  assert.equal(url.searchParams.get("order"), "relevance");
});

test("cancelled turns remain visible but are excluded as complete pairs from model history", () => {
  assert.deepEqual(
    conversationInput(
      [
        { id: "1", role: "user", content: "cancel this" },
        { id: "2", role: "assistant", content: "Stopped", cancelled: true },
      ],
      "next",
      {
        available: true,
        limits: {
          maxMessages: 10,
          maxMessageChars: 100,
          maxConversationChars: 1000,
        },
      },
    ),
    [{ role: "user", content: "next" }],
  );
});
