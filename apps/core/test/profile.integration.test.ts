import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import argon2 from "argon2";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { passwordOptions } from "../src/auth/users.js";

test("own profile and password changes work without data privileges", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const password = `old-${randomUUID()}`, next = `new-${randomUUID()}`;
  const [user] = await db("asmblyr_users").insert({ email: `profile-${randomUUID()}@example.test` }).returning(["id", "email"]);
  await db("asmblyr_password_credentials").insert({ user_id: user.id, password_hash: await argon2.hash(password, passwordOptions) });
  const first = await issueUserTokens(db, user.id), second = await issueUserTokens(db, user.id);
  const headers = { authorization: `Bearer ${first.accessToken}` };
  try {
    await t.test("profile permits only display name and does not expose credentials", async () => {
      const response = await app.inject({ method: "GET", url: "/users/me", headers });
      assert.equal(response.statusCode, 200); assert.equal(response.json().data.hasPassword, true);
      assert.equal(response.json().data.superuser, false); assert.ok(!response.body.includes("password_hash"));
      for (const payload of [{ superuser: true }, { email: "changed@example.test" }, { displayName: "ok", status: "active" }]) {
        assert.equal((await app.inject({ method: "PATCH", url: "/users/me", headers, payload })).statusCode, 400);
      }
      assert.equal((await app.inject({ method: "PATCH", url: "/users/me", headers, payload: { displayName: " Test Name " } })).statusCode, 200);
      assert.equal((await app.inject({ method: "GET", url: "/auth/me", headers })).json().data.displayName, "Test Name");
      assert.equal((await app.inject({ method: "GET", url: "/users/me" })).statusCode, 401);
    });
    await t.test("password change verifies the current password and revokes every session", async () => {
      const rejected = await app.inject({ method: "POST", url: "/users/me/password", headers,
        payload: { currentPassword: "wrong", newPassword: next } });
      assert.equal(rejected.statusCode, 401);
      assert.equal((await app.inject({ method: "GET", url: "/users/me", headers })).statusCode, 200);
      const result = await app.inject({ method: "POST", url: "/users/me/password", headers,
        payload: { currentPassword: password, newPassword: next } });
      assert.equal(result.statusCode, 204);
      for (const pair of [first, second]) {
        assert.equal((await app.inject({ method: "GET", url: "/users/me", headers: { authorization: `Bearer ${pair.accessToken}` } })).statusCode, 401);
        assert.equal((await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: pair.refreshToken } })).statusCode, 401);
      }
      assert.equal((await app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password } })).statusCode, 401);
      assert.equal((await app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password: next } })).statusCode, 200);
      const audit = await db("asmblyr_security_events").where({ subject_id: user.id });
      assert.equal(audit.length, 1); assert.ok(!JSON.stringify(audit).includes(next));
    });
  } finally {
    await db("asmblyr_security_events").where({ subject_id: user.id }).delete();
    await db("asmblyr_users").where({ id: user.id }).delete();
    await app.close(); await db.destroy();
  }
});
