import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { compactionInstructions } from "../src/assistant/history-context.js";
import { AssistantProviderError } from "../src/assistant/provider.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("failed compaction preserves its cursor and transcript; Unicode summaries and history pages stay bounded", async (t) => {
  let fail = true;
  let summaries = 0;
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  const { app, db, headers } = await mcpFixture(
    t,
    new AssistantService(config, async (input, _signal, instructions) => {
      if (instructions === compactionInstructions) {
        summaries++;
        const source = input.messages[0].content;
        assert.ok(Buffer.byteLength(source) <= 38000);
        assert.ok(JSON.parse(source).messages.length > 0);
        if (fail) {
          throw new AssistantProviderError(
            502,
            "assistant_compaction_failed",
            "Unavailable",
          );
        }
        return { content: "Earlier facts", truncated: false };
      }
      assert.equal(input.memory, "Earlier facts");
      return { content: "Continued", truncated: false };
    }),
  );
  const id = (
    await app.inject({
      method: "POST",
      url: "/assistant/conversations",
      headers,
      payload: {},
    })
  ).json().data.id;
  const original = "\u0001".repeat(8000);
  const rows = Array.from({ length: 106 }, (_, index) => ({
    id: randomUUID(),
    conversation_id: id,
    sequence: index + 1,
    role: index % 2 ? "assistant" : "user",
    status: "completed",
    context_scope: index < 6 ? "chat" : "other",
    context_label: "",
    content: index < 6 ? original : "Archived",
    reply_to: null as string | null,
  }));
  for (let index = 1; index < rows.length; index += 2) {
    rows[index].reply_to = rows[index - 1].id;
  }
  await db("asmblyr_assistant_messages").insert(rows);
  await db("asmblyr_assistant_conversations")
    .where({ id })
    .update({ next_sequence: rows.length });
  const send = () =>
    app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers,
      payload: {
        conversationId: id,
        messageId: randomUUID(),
        content: "Continue",
      },
    });
  const failed = await send();
  assert.equal(failed.statusCode, 502, failed.body);
  assert.equal(
    (await db("asmblyr_assistant_memories").where({ conversation_id: id }))
      .length,
    0,
  );
  assert.equal(
    (await db("asmblyr_assistant_conversations").where({ id }).first())
      .compaction_count,
    0,
  );
  fail = false;
  const continued = await send();
  assert.equal(continued.statusCode, 200, continued.body);
  assert.ok(summaries > 1);
  assert.equal(
    (await db("asmblyr_assistant_messages").where({ id: rows[0].id }).first())
      .content,
    original,
  );

  const latest = (
    await app.inject({
      method: "GET",
      url: "/assistant/conversations/" + id,
      headers,
    })
  ).json().data;
  assert.equal(latest.messages.length, 100);
  assert.ok(latest.nextCursor);
  const older = (
    await app.inject({
      method: "GET",
      url: "/assistant/conversations/" + id + "?before=" + latest.nextCursor,
      headers,
    })
  ).json().data;
  assert.equal(older.messages.length, 10);
  assert.equal(older.nextCursor, null);
  const combined = [...older.messages, ...latest.messages];
  assert.equal(new Set(combined.map((message) => message.id)).size, 110);
  assert.deepEqual(
    combined.slice(0, 106).map((message) => message.id),
    rows.map((row) => row.id),
  );
});
