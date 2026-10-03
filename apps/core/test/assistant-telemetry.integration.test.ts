import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { AssistantProviderError } from "../src/assistant/provider.js";
import { responseMetadata } from "../src/assistant/telemetry/usage.js";
import { initialAssistantDefaults } from "../src/assistant/settings.js";

test("request journal persists actor, usage and failures; admin reads with stable pagination and safe rollback", async () => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const original = await db("asmblyr_settings").where({ key: "assistant" }).first();
  const ids: string[] = [];
  const metadata = responseMetadata(
    {
      id: "provider-id",
      model: "actual-model",
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    },
    "responses",
  );
  let mode = "success",
    called = 0;
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "private-key",
    OPENAI_API_MODEL: "requested-model",
  })!;
  const assistant = new AssistantService(config, async () => {
    called++;
    assert.ok(
      await db("asmblyr_assistant_requests").where({ user_id: ids[0], status: "pending" }).first(),
    );
    if (mode === "empty")
      throw new AssistantProviderError(502, "assistant_empty_response", "safe", metadata);
    if (mode === "cancel") throw new AssistantProviderError(499, "assistant_cancelled", "safe");
    if (mode === "timeout") throw new AssistantProviderError(504, "assistant_timeout", "safe");
    return { content: "private answer", truncated: false, metadata };
  });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false, assistant });
  try {
    await db("asmblyr_settings")
      .insert({ key: "assistant", value: JSON.stringify(initialAssistantDefaults) })
      .onConflict("key")
      .merge();
    const users = await db("asmblyr_users")
      .insert([
        { email: `telemetry-admin-${randomUUID()}@example.test`, superuser: true },
        { email: `telemetry-member-${randomUUID()}@example.test`, superuser: false },
      ])
      .returning<{ id: string }[]>("id");
    ids.push(...users.map((user) => user.id));
    const admin = { authorization: `Bearer ${(await issueUserTokens(db, ids[0])).accessToken}` };
    const member = { authorization: `Bearer ${(await issueUserTokens(db, ids[1])).accessToken}` };
    const path = "/settings/assistant/telemetry";
    assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: path, headers: member })).statusCode, 403);
    const send = (
      headers = admin,
      payload: unknown = { messages: [{ role: "user", content: "private prompt" }] },
    ) => app.inject({ method: "POST", url: "/assistant/messages", headers, payload });
    assert.equal((await send(member)).statusCode, 403);
    assert.equal((await send(admin, { invalid: true })).statusCode, 400);
    assert.equal(called, 0);
    const answer = await send();
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.json().data.content, "private answer");
    assert.equal(answer.json().data.truncated, false);
    assert.equal(answer.json().data.summary.modelCalls, 1);
    assert.equal(answer.json().data.summary.usage.totalTokens, 120);
    for (const [value, code] of [
      ["empty", 502],
      ["cancel", 499],
      ["timeout", 504],
    ] as const) {
      mode = value;
      assert.equal((await send()).statusCode, code);
    }
    const result = await app.inject({
      method: "GET",
      url: `${path}?userId=${ids[0]}`,
      headers: admin,
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.headers["cache-control"], "no-store");
    const { items, summary } = result.json().data;
    assert.equal(summary.requests, 4);
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.failed, 2);
    assert.equal(summary.cancelled, 1);
    assert.equal(summary.inputTokens, 200);
    assert.equal(summary.outputTokens, 40);
    assert.equal(summary.totalTokens, 240);
    assert.equal(summary.withUsage, 2);
    assert.equal(summary.reasoningTokens, null);
    assert.equal(items.find((row) => row.status === "succeeded").model, "actual-model");
    assert.equal(items.find((row) => row.status === "succeeded").requestedModel, "requested-model");
    assert.equal(items.find((row) => row.status === "cancelled").usage.inputTokens, null);
    assert.equal(items.find((row) => row.status === "cancelled").turnSummary.status, "cancelled");
    assert.equal(items.find((row) => row.status === "succeeded").turnSummary.toolCalls, 0);
    const records = await db("asmblyr_assistant_requests").where({ user_id: ids[0] });
    assert.ok(records.every((row) => row.finished_at && row.duration_ms >= 0));
    assert.ok(!JSON.stringify(records).includes("private"));
    assert.ok(!result.body.includes("private"));

    const sameTime = new Date(Date.now() - 1000);
    await db("asmblyr_assistant_requests").insert(
      Array.from({ length: 30 }, () => ({
        id: randomUUID(),
        user_id: ids[1],
        started_at: sameTime,
        provider: "compatible",
        api: "responses",
        requested_model: "test",
      })),
    );
    const first = (
      await app.inject({ method: "GET", url: `${path}?userId=${ids[1]}`, headers: admin })
    ).json().data;
    assert.equal(first.items.length, 25);
    assert.ok(first.nextCursor);
    assert.equal(first.summary.requests, 30);
    const query = new URLSearchParams({
      userId: ids[1],
      until: first.period.until,
      cursor: first.nextCursor,
    });
    const second = (
      await app.inject({ method: "GET", url: `${path}?${query}`, headers: admin })
    ).json().data;
    assert.equal(second.items.length, 5);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 30);
    await db("asmblyr_users").where({ id: ids[1] }).delete();
    const deleted = (
      await app.inject({ method: "GET", url: `${path}?userId=${ids[1]}`, headers: admin })
    ).json().data;
    assert.equal(deleted.summary.requests, 30);
    assert.equal(deleted.items[0].user.id, ids[1]);
    assert.equal(deleted.items[0].user.email, null);
    assert.equal(
      (await app.inject({ method: "GET", url: `${path}?days=all`, headers: admin })).statusCode,
      400,
    );
    const migration = createRequire(import.meta.url)(
      "../migrations/20260930080000_assistant_requests.cjs",
    );
    await assert.rejects(migration.down(db), /Cannot discard assistant request history/);
  } finally {
    await app.close();
    if (original) await db("asmblyr_settings").insert(original).onConflict("key").merge();
    else await db("asmblyr_settings").where({ key: "assistant" }).delete();
    if (ids.length) {
      await db("asmblyr_assistant_requests").whereIn("user_id", ids).delete();
      await db("asmblyr_assistant_turns").whereIn("user_id", ids).delete();
      await db("asmblyr_users").whereIn("id", ids).delete();
    }
    await db.destroy();
  }
});
