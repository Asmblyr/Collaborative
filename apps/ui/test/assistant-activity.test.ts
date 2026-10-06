import assert from "node:assert/strict";
import test from "node:test";
import { AssistantRequest } from "../src/components/assistant/assistant-stream";
import { conversationInput } from "../src/components/assistant/assistant-types";

test("provisional text is a work note; final promotion replaces it and retains action cards", async (t) => {
  const activity = [
    { kind: "note" as const, text: "Found three clients; using the main one" },
  ];
  const events = [
    {
      type: "text-delta",
      reset: true,
      provisional: true,
      delta: activity[0].text,
    },
    { type: "activity", activity: activity[0] },
    {
      type: "text-delta",
      reset: true,
      provisional: true,
      delta: "Result: 486",
    },
    { type: "text-delta", reset: true, delta: "Result: 486" },
    {
      type: "answer",
      data: {
        content: "Result: 486",
        activity,
        selections: [{ resultId: "selection" }],
        truncated: false,
      },
    },
  ];
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        events.map((event) => JSON.stringify(event)).join("\n") + "\n",
        { headers: { "content-type": "application/x-ndjson" } },
      ),
  );
  const request = new AssistantRequest();
  const mainText: string[] = [];
  const drafts: string[] = [];
  const answer = await request.send(
    {},
    () => {},
    (text) => mainText.push(text),
    () => drafts.push(request.activityDraft),
  );
  assert.equal(request.text, "Result: 486");
  assert.equal(request.activityDraft, "");
  assert.deepEqual(request.activity, activity);
  assert.ok(!mainText.some((text) => text.includes("three clients")));
  assert.equal(answer.selections?.[0].resultId, "selection");
  const input = conversationInput(
    [
      { id: "user", role: "user", content: "Find" },
      { id: "reply", role: "assistant", content: answer.content, activity },
    ],
    "Next",
    {
      available: true,
      limits: {
        maxMessages: 10,
        maxMessageChars: 8000,
        maxConversationChars: 24000,
      },
    },
  );
  assert.ok(!JSON.stringify(input).includes("three clients"));
  assert.equal(input[1].content, answer.content);
});

test("disconnect during an unclassified step preserves the draft only in the work log", async (t) => {
  const event = {
    type: "text-delta",
    reset: true,
    provisional: true,
    delta: "Reading data",
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify(event) + "\n", {
        headers: { "content-type": "application/x-ndjson" },
      }),
  );
  const request = new AssistantRequest();
  await assert.rejects(
    request.send({}, () => {}),
    /Соединение прервалось/,
  );
  assert.equal(request.text, "");
  assert.equal(request.activityDraft, "Reading data");
});
