import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantStreamEvent } from "@asmblyr-collaborative/contracts";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { publicServer } from "./support/public-server.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { assistantSse, chatChunk } from "./support/assistant-sse.js";

test(
  "stream reports actual progress, aborts provider, retains usage, and releases the user slot",
  { timeout: 20000 },
  async (t) => {
    const config = {
      ...assistantConfigFromEnv({
        OPENAI_API_KEY: "test",
        OPENAI_API_MODEL: "test",
      })!,
      api: "chat-completions" as const,
    };
    let cancelled = false;
    let complete = false;
    const provider = createAssistantProvider(config, async (_url, init) => {
      if (complete) {
        const stream = assistantSse();
        stream.send(chatChunk({ content: "Done" }, "stop"));
        stream.send({
          id: "chat-stream",
          model: "test",
          choices: [],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        });
        stream.end();
        return stream.response;
      }
      const stream = assistantSse(init?.signal);
      init?.signal?.addEventListener(
        "abort",
        () => {
          cancelled = true;
        },
        { once: true },
      );
      stream.send(chatChunk({ content: "Частичный ответ" }));
      return stream.response;
    });
    const { app, db, access } = await mcpFixture(
      t,
      new AssistantService(config, provider),
    );
    const cookie = await createBrowserSession(
      db,
      await issueUserTokens(db, access.principal.id),
    );
    const headers = {
      cookie: `asmblyr_session=${cookie}`,
      origin: "http://localhost:3000",
    };
    const address = await publicServer(t, app);
    const response = await fetch(`${address}/api/assistant/messages`, {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/x-ndjson",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "private prompt" }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type")!,
      /application\/x-ndjson/,
    );
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    const events: AssistantStreamEvent[] = [];
    let buffer = "";
    let id = "";
    let stopSent = false;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += chunk.value;
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const event = JSON.parse(
          buffer.slice(0, index),
        ) as AssistantStreamEvent;
        buffer = buffer.slice(index + 1);
        events.push(event);
        if (event.type === "started") id = event.requestId;
        if (event.type === "text-delta" && !stopSent) {
          assert.equal(event.delta, "Частичный ответ");
          stopSent = true;
          const stop = await app.inject({
            method: "POST",
            url: `/assistant/messages/${id}/cancel`,
            headers,
          });
          assert.equal(stop.statusCode, 200, stop.body);
        }
      }
    }
    assert.equal(cancelled, true);
    assert.ok(events.some((event) => event.type === "progress"));
    assert.ok(
      events.some(
        (event) =>
          event.type === "activity" && event.activity.kind === "status",
      ),
    );
    assert.ok(
      events.some((event) => event.type === "text-delta" && !event.provisional),
    );
    const terminal = events.at(-1)!;
    assert.equal(terminal.type, "error");
    assert.ok(terminal.type === "error" && terminal.summary);
    assert.equal(terminal.code, "assistant_cancelled");
    assert.equal(terminal.summary.status, "cancelled");
    assert.equal(terminal.summary.modelCalls, 1);
    assert.equal(terminal.summary.usage.inputTokens, null);
    const row = await db("asmblyr_assistant_turns")
      .where({ id: terminal.summary.turnId })
      .first();
    assert.equal(row.summary.status, "cancelled");
    assert.ok(!JSON.stringify(events).includes("private prompt"));
    complete = true;
    const next = await app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers: { ...headers, accept: "application/x-ndjson" },
      payload: { messages: [{ role: "user", content: "next" }] },
    });
    const last = JSON.parse(next.body.trim().split("\n").at(-1)!);
    assert.ok(next.body.includes('"type":"text-delta"'));
    assert.equal(last.type, "answer");
    assert.equal(last.data.content, "Done");
    assert.equal(last.data.summary.usage.inputTokens, 5);
  },
);
