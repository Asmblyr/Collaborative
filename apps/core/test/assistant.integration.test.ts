import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";

test("assistant routes enforce identity, app access, availability and bounded input", async () => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const config = assistantConfigFromEnv({ OPENAI_API_KEY: "private-test-key", OPENAI_API_MODEL: "test-model" })!;
  let calls = 0;
  const assistant = new AssistantService(config, async () => { calls++; return { content: "Test answer", truncated: false }; });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false, assistant });
  const disabled = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const ids: string[] = [];
  const collectionName = `test_assistant_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let policyId: string | undefined;
  let collectionCreated = false;
  try {
    const users = await db("asmblyr_users").insert([
      { email: `assistant-admin-${randomUUID()}@example.test`, superuser: true },
      { email: `assistant-user-${randomUUID()}@example.test`, superuser: false },
    ]).returning<{ id: string }[]>("id");
    ids.push(...users.map((user) => user.id));
    const adminPair = await issueUserTokens(db, ids[0]);
    const memberPair = await issueUserTokens(db, ids[1]);
    const admin = { authorization: `Bearer ${adminPair.accessToken}` };
    const member = { authorization: `Bearer ${memberPair.accessToken}` };
    const payload = { messages: [{ role: "user", content: "Hello" }] };
    assert.equal((await app.inject({ method: "GET", url: "/assistant/status" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/assistant/status", headers: member })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: member, payload })).statusCode, 403);
    assert.equal(calls, 0);
    const status = await app.inject({ method: "GET", url: "/assistant/status", headers: admin });
    assert.equal(status.statusCode, 200); assert.equal(status.json().data.available, true);
    assert.equal(status.headers["cache-control"], "no-store"); assert.ok(!status.body.includes("private-test-key"));
    assert.equal((await disabled.inject({ method: "GET", url: "/assistant/status", headers: admin })).json().data.available, false);
    assert.equal((await disabled.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload })).statusCode, 503);
    assert.equal((await disabled.inject({ method: "GET", url: "/health" })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: { ...payload, model: "other" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: { messages: [{ role: "user", content: "x".repeat(160001) }] } })).statusCode, 413);
    const answer = await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload });
    assert.equal(answer.statusCode, 200); assert.equal(answer.json().data.content, "Test answer"); assert.equal(calls, 1);

    const collection = await app.inject({ method: "POST", url: "/collections", headers: admin, payload: { name: collectionName } });
    assert.equal(collection.statusCode, 201, collection.body); collectionCreated = true;
    const policy = await app.inject({ method: "POST", url: "/policies", headers: admin, payload: { name: collectionName } });
    assert.equal(policy.statusCode, 201, policy.body); policyId = policy.json().data.id;
    const permission = await app.inject({ method: "POST", url: "/permissions", headers: admin, payload: { collection: collectionName, action: "read", fields: ["*"] } });
    assert.equal(permission.statusCode, 201, permission.body);
    assert.equal((await app.inject({ method: "PUT", url: `/policies/${policyId}/permissions/${permission.json().data.id}`, headers: admin })).statusCode, 204);
    assert.equal((await app.inject({ method: "PUT", url: `/policies/${policyId}/users/${ids[1]}`, headers: admin })).statusCode, 204);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: member, payload })).statusCode, 200);
    assert.equal(calls, 2);
    await db("asmblyr_users").where({ id: ids[1] }).update({ status: "disabled" });
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: member, payload })).statusCode, 401);
    assert.equal(calls, 2);
  } finally {
    await app.close(); await disabled.close();
    if (policyId) await db("asmblyr_policies").where({ id: policyId }).delete();
    if (collectionCreated) { await db.schema.dropTableIfExists(collectionName); await db("asmblyr_collections").where({ name: collectionName }).delete(); }
    if (ids.length) {
      await db("asmblyr_assistant_requests").whereIn("user_id", ids).delete();
      await db("asmblyr_users").whereIn("id", ids).delete();
    }
    await db.destroy();
  }
});
