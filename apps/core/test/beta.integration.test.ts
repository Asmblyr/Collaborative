import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import {
  requestBucket,
  acquireAssistantLease,
} from "../src/operations/limits.js";
import { cleanupOperations } from "../src/operations/retention.js";
import { privateLogger } from "../src/operations/logging.js";
import { randomUUID } from "node:crypto";

test("shared limits serialize concurrent workers, recover expired leases, and retain business history by default", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  try {
    const key = randomUUID();
    const requests = await Promise.allSettled(
      Array.from({ length: 12 }, () => requestBucket(db, key, 60000, 3)),
    );
    assert.equal(
      requests.filter((result) => result.status === "fulfilled").length,
      3,
    );
    const [user] = await db("public.asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test` })
      .returning("id");
    const limits = { assistantDailyRequests: 2, assistantConcurrent: 1 };
    const leases = await Promise.allSettled([
      acquireAssistantLease(db, user.id, limits),
      acquireAssistantLease(db, user.id, limits),
    ]);
    assert.equal(
      leases.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const release = leases.find((result) => result.status === "fulfilled")!;
    if (release.status === "fulfilled") {
      await release.value();
    }
    const second = await acquireAssistantLease(db, user.id, limits);
    await second();
    await assert.rejects(acquireAssistantLease(db, user.id, limits), /лимит/);
    const [challenge] = await db("public.asmblyr_passkey_challenges")
      .insert({
        purpose: "login",
        challenge: "expired",
        expires_at: new Date(0),
      })
      .returning("id");
    const before = await db("public.asmblyr_item_events")
      .count("* as count")
      .first();
    assert.ok((await cleanupOperations(db)) >= 1);
    assert.equal(
      await db("public.asmblyr_passkey_challenges")
        .where({ id: challenge.id })
        .first(),
      undefined,
    );
    assert.deepEqual(
      await db("public.asmblyr_item_events").count("* as count").first(),
      before,
    );
    // Explicit retention also checks actual column names and dependent-row order.
    await cleanupOperations(db, 90);
    assert.equal(
      privateLogger.serializers.req({
        id: "id",
        method: "GET",
        url: "/items/test?search=private",
      }).path,
      "/items/test",
    );
    assert.deepEqual(
      privateLogger.serializers.err({ name: "DatabaseError", code: "23505" }),
      {
        type: "DatabaseError",
        message: "Internal failure",
        stack: "",
        code: "23505",
      },
    );
  } finally {
    await db.destroy();
  }
});
