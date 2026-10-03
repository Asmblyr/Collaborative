import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import knex from "knex";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider, AssistantProviderError } from "../src/assistant/provider.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantJournal } from "../src/assistant/telemetry/journal.js";
import { readAssistantTelemetry } from "../src/assistant/telemetry/repository.js";
import { parseTelemetryQuery } from "../src/assistant/telemetry/query.js";

test("long turns persist complete metrics, partial usage and failures after successful model calls", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const userId = randomUUID();
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "requested",
    OPENAI_API_MODE: "chat-completions",
  })!;
  let calls = 0;
  let mode = "success";
  const controller = new AbortController();
  const provider = createAssistantProvider(config, async () => {
    calls++;
    const done = calls === 8;
    return Response.json({
      model: "actual",
      choices: [
        {
          finish_reason: done ? "stop" : "tool_calls",
          message: {
            content: done ? "private answer" : null,
            ...(done
              ? {}
              : {
                  tool_calls: [
                    {
                      id: String(calls),
                      type: "function",
                      function: {
                        name: "describe_collection",
                        arguments: calls === 2 ? "invalid JSON" : "{}",
                      },
                    },
                  ],
                }),
          },
        },
      ],
      ...(calls === 3
        ? {}
        : { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }),
    });
  });
  const service = new AssistantService(config, provider);
  const journal = createAssistantJournal(db, () => assert.fail("Journal should finalize"));
  const send = () =>
    service.respond(
      userId,
      { messages: [{ role: "user", content: "private prompt" }] },
      controller.signal,
      undefined,
      journal,
      async () => ({
        context: {},
        definitions: [],
        proposals: [],
        execute: async () => {
          if (mode === "context") return { content: "private ".repeat(9000) };
          if (mode === "cancel") controller.abort();
          return { ok: true };
        },
      }),
    );
  try {
    const answer = await send();
    assert.equal(answer.content, "private answer");
    assert.equal(answer.summary.modelCalls, 8);
    assert.equal(answer.summary.toolCalls, 7);
    assert.equal(answer.summary.toolErrors, 1);
    assert.deepEqual(answer.summary.models, ["actual"]);
    assert.equal(answer.summary.requestedModel, "requested");
    assert.equal(answer.summary.usage.inputTokens, 70);
    assert.equal(answer.summary.usage.outputTokens, 14);
    assert.equal(answer.summary.usageSamples.inputTokens, 7);
    assert.equal(answer.summary.usage.reasoningTokens, null);
    const rows = await db("public.asmblyr_assistant_requests")
      .where({ user_id: userId })
      .orderBy("call_index");
    assert.equal(rows.length, 8);
    assert.deepEqual(
      rows.map((row) => row.call_index),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    const turn = await db("public.asmblyr_assistant_turns")
      .where({ id: answer.summary.turnId })
      .first();
    assert.deepEqual(turn.summary, answer.summary);
    assert.ok(turn.finished_at);
    assert.ok(!JSON.stringify(turn).includes("private"));

    for (const next of ["context", "cancel"]) {
      mode = next;
      calls = 0;
      await assert.rejects(send(), (error) => {
        assert.ok(error instanceof AssistantProviderError);
        assert.equal(
          error.code,
          next === "context" ? "assistant_context_limit" : "assistant_cancelled",
        );
        assert.equal(error.summary?.modelCalls, 1);
        assert.equal(error.summary?.toolCalls, 1);
        assert.equal(error.summary?.usage.totalTokens, 12);
        return true;
      });
    }
    const telemetry = await readAssistantTelemetry(db, parseTelemetryQuery({ userId }));
    assert.equal(telemetry.summary.requests, 10);
    assert.equal(telemetry.summary.succeeded, 10);
    assert.ok(telemetry.items.some((item) => item.turnSummary?.status === "failed"));
    assert.ok(telemetry.items.some((item) => item.turnSummary?.status === "cancelled"));
    const migration = createRequire(import.meta.url)(
      "../migrations/20261001060000_assistant_turn_metrics.cjs",
    );
    await assert.rejects(migration.down(db), /Cannot discard assistant turn history/);
  } finally {
    await db("public.asmblyr_assistant_requests").where({ user_id: userId }).delete();
    await db("public.asmblyr_assistant_turns").where({ user_id: userId }).delete();
    await db.destroy();
  }
});
