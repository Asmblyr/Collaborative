import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AssistantInput } from "../src/assistant/validation.js";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { compactionInstructions } from "../src/assistant/history-context.js";
import { AssistantProviderError } from "../src/assistant/provider.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("saved conversations isolate owners and sessions, compact without losing the transcript, and deduplicate retries", async (t) => {
  const inputs: AssistantInput[] = [];
  let compactCalls = 0;
  let fail = false;
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  const assistant = new AssistantService(
    config,
    async (input, _signal, instructions, run) => {
      if (instructions === compactionInstructions) {
        compactCalls++;
        assert.equal(run?.tools, undefined);
        assert.ok(input.messages[0].content.includes("old-goal"));
        return {
          content: "Remember old-goal and the user's decision.",
          truncated: false,
        };
      }
      if (fail) {
        run?.onText?.({
          type: "text-delta",
          reset: true,
          delta: "Partial answer",
        });
        throw new AssistantProviderError(499, "assistant_cancelled", "Stopped");
      }
      inputs.push(structuredClone(input));
      return { content: "Answer " + "a".repeat(6000), truncated: false };
    },
  );
  const { app, db, headers, access } = await mcpFixture(t, assistant);
  const create = async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistant/conversations",
      headers,
      payload: {},
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json().data.id as string;
  };
  const id = await create();
  const send = async (
    content: string,
    messageId = randomUUID(),
    conversationId = id,
    context: object | null = null,
  ) =>
    app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers,
      payload: { conversationId, messageId, content, context },
    });
  const firstMessageId = randomUUID();
  const prompt = "old-goal " + "u".repeat(5990);
  const firstAnswer = await send(prompt, firstMessageId);
  assert.equal(firstAnswer.statusCode, 200, firstAnswer.body);
  const callsBeforeDuplicate = inputs.length;
  const duplicate = await send(prompt, firstMessageId);
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(inputs.length, callsBeforeDuplicate);
  assert.equal((await send("different", firstMessageId)).statusCode, 409);
  for (let turn = 0; turn < 4; turn++) {
    const response = await send(prompt + turn);
    assert.equal(response.statusCode, 200, response.body);
  }
  assert.ok(compactCalls > 0);
  const input = inputs.at(-1)!;
  assert.match(input.memory!, /old-goal/);
  assert.ok(input.messages.length <= 25);
  assert.ok(
    input.messages.reduce(
      (size, message) => size + message.content.length,
      input.memory!.length,
    ) <= 24000,
  );
  const transcript = await app.inject({
    method: "GET",
    url: "/assistant/conversations/" + id,
    headers,
  });
  assert.equal(transcript.statusCode, 200);
  assert.equal(transcript.json().data.messages.length, 10);
  assert.equal(transcript.json().data.messages[0].content, prompt);
  assert.ok(transcript.json().data.conversation.compactionCount > 0);
  assert.ok(transcript.json().data.messages.at(-1).summary.modelCalls >= 2);

  const fresh = await create();
  assert.equal(
    (await send("new-context-only", randomUUID(), fresh)).statusCode,
    200,
  );
  assert.equal(inputs.at(-1)!.memory, undefined);
  assert.deepEqual(inputs.at(-1)!.messages, [
    { role: "user", content: "new-context-only" },
  ]);
  assert.equal(
    (
      await send("other-page", randomUUID(), id, {
        page: "collections",
        workspaceId: null,
      })
    ).statusCode,
    200,
  );
  assert.equal(inputs.at(-1)!.memory, undefined);
  assert.deepEqual(inputs.at(-1)!.messages, [
    { role: "user", content: "other-page" },
  ]);

  const outsider = randomUUID();
  await db("asmblyr_users").insert({
    id: outsider,
    email: outsider + "@example.test",
    superuser: true,
  });
  const otherHeaders = {
    authorization:
      "Bearer " + (await issueUserTokens(db, outsider)).accessToken,
  };
  for (const method of ["GET", "DELETE"] as const) {
    const denied = await app.inject({
      method,
      url: "/assistant/conversations/" + id,
      headers: otherHeaders,
    });
    assert.equal(denied.statusCode, 404);
  }
  const deniedSend = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers: otherHeaders,
    payload: {
      conversationId: id,
      messageId: randomUUID(),
      content: "steal history",
    },
  });
  assert.equal(deniedSend.statusCode, 404);
  const otherList = await app.inject({
    method: "GET",
    url: "/assistant/conversations",
    headers: otherHeaders,
  });
  assert.deepEqual(otherList.json().data.items, []);
  await db("asmblyr_users").where({ id: outsider }).delete();

  fail = true;
  const cancelled = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers: { ...headers, accept: "application/x-ndjson" },
    payload: {
      conversationId: fresh,
      messageId: randomUUID(),
      content: "stop this",
      context: null,
    },
  });
  assert.equal(cancelled.statusCode, 200);
  const terminal = JSON.parse(cancelled.body.trim().split("\n").at(-1)!);
  assert.equal(terminal.code, "assistant_cancelled");
  assert.equal(typeof terminal.conversation.assistantMessageId, "string");
  const saved = (
    await app.inject({
      method: "GET",
      url: "/assistant/conversations/" + fresh,
      headers,
    })
  ).json().data;
  assert.equal(saved.messages.at(-1).status, "cancelled");
  assert.equal(saved.messages.at(-1).content, "Partial answer");
  assert.equal(saved.conversation.busyUntil, null);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/assistant/conversations/" + fresh,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (await db("asmblyr_assistant_messages").where({ conversation_id: fresh }))
      .length,
    0,
  );
  assert.equal(
    (await db("asmblyr_assistant_memories").where({ conversation_id: fresh }))
      .length,
    0,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/assistant/conversations/" + fresh,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await db("asmblyr_assistant_conversations").where({
        user_id: access.principal.id,
      })
    ).length,
    1,
  );
});

test(
  "conversation claims reject concurrent turns and recover interrupted answers",
  { timeout: 20000 },
  async (t) => {
    let release: () => void = () => {};
    let start: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const config = assistantConfigFromEnv({
      OPENAI_API_KEY: "test",
      OPENAI_API_MODEL: "test",
    })!;
    const { app, db, headers } = await mcpFixture(
      t,
      new AssistantService(config, async () => {
        start();
        await held;
        return { content: "Done", truncated: false };
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
    const pending = app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers,
      payload: {
        conversationId: id,
        messageId: randomUUID(),
        content: "first",
      },
    });
    // LightMyRequest starts executing when the thenable is consumed.
    const first = Promise.resolve(pending);
    await started;
    try {
      const second = await app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers,
        payload: {
          conversationId: id,
          messageId: randomUUID(),
          content: "second",
        },
      });
      assert.equal(second.statusCode, 409, second.body);
      assert.equal(
        (
          await app.inject({
            method: "DELETE",
            url: "/assistant/conversations/" + id,
            headers,
          })
        ).statusCode,
        409,
      );
    } finally {
      release();
    }
    assert.equal((await first).statusCode, 200);
    const interruptedId = randomUUID();
    await db("asmblyr_assistant_messages").insert({
      id: interruptedId,
      conversation_id: id,
      sequence: 3,
      role: "assistant",
      content: "Saved fragment",
      status: "pending",
      context_scope: "chat",
      context_label: "",
    });
    await db("asmblyr_assistant_conversations")
      .where({ id })
      .update({
        active_message_id: interruptedId,
        busy_until: new Date(Date.now() - 1000),
        next_sequence: 3,
      });
    const recovered = await app.inject({
      method: "GET",
      url: "/assistant/conversations/" + id,
      headers,
    });
    assert.equal(recovered.json().data.messages.at(-1).status, "interrupted");
    assert.equal(recovered.json().data.conversation.busyUntil, null);
  },
);
