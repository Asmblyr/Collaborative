import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantProviderError } from "../src/assistant/provider.js";
import type { AssistantInput } from "../src/assistant/validation.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("saved work logs survive reload and retry without entering answers or follow-up context", async (t) => {
  const inputs: AssistantInput[] = [];
  let cancel = false;
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  const assistant = new AssistantService(
    config,
    async (input, _signal, _instructions, run) => {
      inputs.push(structuredClone(input));
      run?.onText?.({
        type: "text-delta",
        reset: true,
        delta: "PUBLIC WORK NOTE",
        provisional: true,
      });
      run?.onActivity?.({ kind: "note", text: "PUBLIC WORK NOTE" });
      if (cancel) {
        throw new AssistantProviderError(499, "assistant_cancelled", "Stopped");
      }
      return { content: "Final result: 42", truncated: false };
    },
  );
  const { app, headers, db } = await mcpFixture(t, assistant);
  const created = await app.inject({
    method: "POST",
    url: "/assistant/conversations",
    headers,
    payload: {},
  });
  const conversationId = created.json().data.id;
  const messageId = randomUUID();
  const payload = { conversationId, messageId, content: "Find data" };
  const response = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers: { ...headers, accept: "application/x-ndjson" },
    payload,
  });
  assert.equal(response.statusCode, 200, response.body);
  const events = response.body
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const answer = events.at(-1).data;
  assert.equal(answer.content, "Final result: 42");
  assert.ok(
    events.some((event) => event.type === "text-delta" && event.provisional),
  );
  assert.ok(
    answer.activity.some(
      (entry: { text: string }) => entry.text === "PUBLIC WORK NOTE",
    ),
  );
  const cached = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload,
  });
  assert.deepEqual(cached.json().data.activity, answer.activity);
  assert.equal(inputs.length, 1);
  const restored = await app.inject({
    method: "GET",
    url: `/assistant/conversations/${conversationId}`,
    headers,
  });
  assert.deepEqual(
    restored.json().data.messages.at(-1).activity,
    answer.activity,
  );
  assert.equal(restored.json().data.messages.at(-1).content, answer.content);
  const next = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload: { ...payload, messageId: randomUUID(), content: "Continue" },
  });
  assert.equal(next.statusCode, 200, next.body);
  assert.ok(!JSON.stringify(inputs.at(-1)).includes("PUBLIC WORK NOTE"));
  assert.ok(JSON.stringify(inputs.at(-1)).includes("Final result: 42"));
  cancel = true;
  const stopped = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers: { ...headers, accept: "application/x-ndjson" },
    payload: { ...payload, messageId: randomUUID(), content: "Stop" },
  });
  const error = JSON.parse(stopped.body.trim().split("\n").at(-1)!);
  assert.equal(error.code, "assistant_cancelled");
  const row = await db("asmblyr_assistant_messages")
    .where({ id: error.conversation.assistantMessageId })
    .first();
  assert.equal(row.status, "cancelled");
  assert.equal(row.content, "Запрос остановлен.");
  assert.ok(
    row.activity.some(
      (entry: { text: string }) => entry.text === "PUBLIC WORK NOTE",
    ),
  );
});
