import "./support/require-test-database.js";
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import {
  authenticateAccess,
  issueUserTokens,
  refreshUserTokens,
} from "../src/auth/tokens.js";

test("session ownership, refresh/revoke race and revoke others", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const users = await db("asmblyr_users")
    .insert([1, 2].map(() => ({ email: `${randomUUID()}@example.test` })))
    .returning("id");
  try {
    const first = await issueUserTokens(
      db,
      users[0].id,
      "Mozilla/5.0 Windows Chrome/130.0",
    );
    const second = await issueUserTokens(db, users[0].id);
    const other = await issueUserTokens(db, users[1].id);
    const identity = await authenticateAccess(
      db,
      `Bearer ${first.accessToken}`,
    );
    const secondIdentity = await authenticateAccess(
      db,
      `Bearer ${second.accessToken}`,
    );
    const foreign = await authenticateAccess(db, `Bearer ${other.accessToken}`);
    const headers = { authorization: `Bearer ${first.accessToken}` };
    const res = await app.inject({ url: "/users/me/sessions", headers });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.length, 2);
    assert.equal(
      res.json().data.find((s: { current: boolean }) => s.current).clientLabel,
      "Chrome · Windows",
    );
    assert.ok(!res.body.includes(first.refreshToken));
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/users/me/sessions/${foreign.sessionId}`,
          headers,
        })
      ).statusCode,
      404,
    );
    await Promise.allSettled([
      refreshUserTokens(db, second.refreshToken),
      app.inject({
        method: "DELETE",
        url: `/users/me/sessions/${secondIdentity.sessionId}`,
        headers,
      }),
    ]);
    await assert.rejects(
      authenticateAccess(db, `Bearer ${second.accessToken}`),
    );
    await assert.rejects(refreshUserTokens(db, second.refreshToken));
    const third = await issueUserTokens(db, users[0].id);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: "/users/me/sessions/others",
          headers,
        })
      ).statusCode,
      204,
    );
    await assert.rejects(refreshUserTokens(db, third.refreshToken));
    assert.equal(
      (await authenticateAccess(db, `Bearer ${first.accessToken}`)).sessionId,
      identity.sessionId,
    );
    await authenticateAccess(db, `Bearer ${other.accessToken}`);
  } finally {
    await db("asmblyr_security_events")
      .whereIn(
        "actor_id",
        users.map((u) => u.id),
      )
      .delete();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((u) => u.id),
      )
      .delete();
    await app.close();
    await db.destroy();
  }
});
