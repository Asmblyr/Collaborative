import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import knex from "knex";
import { AssistantRequests } from "../src/assistant/requests.js";
import { DatabaseActionDrafts } from "../src/plugins/database-drafts.js";
import { createApp } from "../src/app.js";
import { credentialRateLimit } from "../src/auth/rate-limit.js";

test("replicas share cancellation, prepared forms and credential limits without sharing owners", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const userId = randomUUID();
  await db("asmblyr_users").insert({
    id: userId,
    email: `${userId}@example.test`,
  });
  const first = new AssistantRequests(db, () => assert.fail("poll failed"));
  const second = new AssistantRequests(db, () => assert.fail("poll failed"));
  const owner = `user:${userId}`;
  const apps = [
    createApp({ databaseUrl: process.env.DATABASE_URL, logger: false }),
    createApp({ databaseUrl: process.env.DATABASE_URL, logger: false }),
  ];
  t.after(async () => {
    first.close();
    second.close();
    await Promise.all(apps.map((app) => app.close()));
    await db("asmblyr_action_drafts").where({ owner }).delete();
    await db("asmblyr_users").where({ id: userId }).delete();
    await db.destroy();
  });
  const controller = new AbortController();
  const id = await first.add(userId, controller);
  assert.equal(await second.cancel(id, randomUUID()), false);
  assert.equal(controller.signal.aborted, false);
  assert.equal(await second.cancel(id, userId), true);
  for (let i = 0; i < 30 && !controller.signal.aborted; i++) {
    await delay(100);
  }
  assert.equal(controller.signal.aborted, true);
  await first.remove(id);
  assert.equal(await second.cancel(id, userId), false);
  const draft = await new DatabaseActionDrafts(db).create(owner, {
    namespace: "example",
    actionId: "run",
    pageId: "form",
    title: "Test",
    input: { amount: 1 },
    output: {},
  });
  const other = new DatabaseActionDrafts(db);
  assert.deepEqual((await other.get(owner, "example", draft.draftId)).input, {
    amount: 1,
  });
  await assert.rejects(other.get("user:another", "example", draft.draftId), {
    statusCode: 404,
  });
  await assert.rejects(other.get(owner, "other", draft.draftId), {
    statusCode: 404,
  });
  await db("asmblyr_action_drafts")
    .where({ id: draft.draftId })
    .update({ expires_at: new Date(0) });
  await assert.rejects(other.get(owner, "example", draft.draftId), {
    statusCode: 404,
  });
  for (const app of apps) {
    app.get(
      "/replica-limit",
      { preHandler: credentialRateLimit(2, () => userId) },
      async () => ({ ok: true }),
    );
  }
  assert.equal((await apps[0].inject("/replica-limit")).statusCode, 200);
  assert.equal((await apps[1].inject("/replica-limit")).statusCode, 200);
  assert.equal((await apps[0].inject("/replica-limit")).statusCode, 429);
});
