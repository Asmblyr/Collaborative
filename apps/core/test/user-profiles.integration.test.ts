import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens, refreshUserTokens } from "../src/auth/tokens.js";
import { recordUserActivity } from "../src/auth/user-activity.js";

test("universal profiles preserve optional fields, protect account data and sample activity", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const [admin, member] = await db("asmblyr_users")
    .insert(
      [true, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const tokens = await Promise.all(
    [admin, member].map((user) => issueUserTokens(db, user.id)),
  );
  t.after(async () => {
    await app.close();
    await db("asmblyr_users").whereIn("id", [admin.id, member.id]).delete();
    await db.destroy();
  });
  async function call(
    method: "GET" | "PATCH",
    url: string,
    payload?: object,
    actor = 1,
    status = 200,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${tokens[actor].accessToken}` },
      payload,
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json().data;
  }
  const before = await call("GET", "/users/me");
  assert.equal(before.firstName, null);
  assert.ok(before.lastLoginAt && before.lastActiveAt && before.updatedAt);
  await call("PATCH", "/users/me", {
    displayName: "Nickname",
    firstName: " Иван ",
    lastName: "Чикишев",
    description: "Line one\nLine two",
  });
  const after = await call("PATCH", "/users/me", { lastName: "" });
  assert.equal(after.displayName, "Nickname");
  assert.equal(after.firstName, "Иван");
  assert.equal(after.lastName, null);
  assert.equal(after.description, "Line one\nLine two");
  assert.ok(Date.parse(after.updatedAt) >= Date.parse(before.updatedAt));
  for (const payload of [
    { createdAt: "today" },
    { lastLoginAt: "today" },
    { hasPassword: true },
    { firstName: "x".repeat(121) },
    { description: "x".repeat(2001) },
    { description: "bad\u0000value" },
    { avatarId: "invalid" },
    {},
  ]) {
    await call("PATCH", "/users/me", payload, 1, 400);
  }
  await call("GET", `/users/${admin.id}/profile`, undefined, 1, 403);
  await call(
    "PATCH",
    `/users/${admin.id}/profile`,
    { firstName: "Escalation" },
    1,
    403,
  );
  const adminView = await call(
    "GET",
    `/users/${member.id}/profile`,
    undefined,
    0,
  );
  assert.equal(adminView.firstName, "Иван");
  assert.equal(adminView.password_hash, undefined);
  await call("PATCH", `/users/${member.id}/profile`, { description: null }, 0);
  assert.equal((await call("GET", "/users/me")).description, null);
  assert.equal(
    (
      await call("PATCH", "/users/me/preferences", {
        timezone: "Asia/Yekaterinburg",
      })
    ).timezone,
    "Asia/Yekaterinburg",
  );
  assert.equal(
    (await call("GET", "/users/me/preferences", undefined, 0)).timezone,
    null,
  );
  await call(
    "PATCH",
    "/users/me/preferences",
    { timezone: "Planet/Nowhere" },
    1,
    400,
  );
  assert.equal(
    (await call("PATCH", "/users/me/preferences", { timezone: null })).timezone,
    null,
  );
  const loginAt = (
    await db("asmblyr_users").where({ id: member.id }).first("last_login_at")
  ).last_login_at;
  await refreshUserTokens(db, tokens[1].refreshToken);
  assert.equal(
    (
      await db("asmblyr_users").where({ id: member.id }).first("last_login_at")
    ).last_login_at.toISOString(),
    loginAt.toISOString(),
  );
  await db("asmblyr_users")
    .where({ id: admin.id })
    .update({ last_active_at: new Date(0) });
  const activityDb = knex({
    client: "pg",
    connection: process.env.DATABASE_URL,
  });
  try {
    await recordUserActivity(activityDb, admin.id);
    const recorded = await db("asmblyr_users")
      .where({ id: admin.id })
      .first("last_active_at", "updated_at");
    await recordUserActivity(activityDb, admin.id);
    const repeated = await db("asmblyr_users")
      .where({ id: admin.id })
      .first("last_active_at", "updated_at");
    assert.deepEqual(repeated, recorded);
    assert.ok(recorded.last_active_at.getTime() > 0);
  } finally {
    await activityDb.destroy();
  }
});
