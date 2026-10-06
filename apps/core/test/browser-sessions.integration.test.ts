import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import knex from "knex";
import { createApp } from "../src/app.js";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { inviteUser } from "../src/auth/invitations.js";
import { virtualPasskey } from "./support/webauthn.js";

const origin = "http://localhost:3000";

test("browser sessions are private, revocable, shared across replicas and isolated from API refresh", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const options = {
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sessionCookiePrefix: "test_browser",
  };
  const app = createApp(options);
  const replica = createApp(options);
  const email = `${randomUUID()}@example.test`;
  const password = "browser-test-password-12345";
  const [user] = await db("asmblyr_users")
    .insert({ email, superuser: true })
    .returning("id");
  await db("asmblyr_password_credentials").insert({
    user_id: user.id,
    password_hash: await argon2.hash(password),
  });
  t.after(async () => {
    await app.close();
    await replica.close();
    await db("asmblyr_users").where({ id: user.id }).delete();
    await db.destroy();
  });
  const login = (headers: Record<string, string> = { origin }) =>
    app.inject({
      method: "POST",
      url: "/api/auth/browser/login",
      headers,
      payload: { email, password },
    });
  for (const headers of [
    {},
    { origin: "https://evil.example" },
    { origin, "sec-fetch-site": "cross-site" },
  ]) {
    assert.equal((await login(headers)).statusCode, 403);
  }
  const response = await login();
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { ok: true });
  const cookie = response.cookies.find(
    (entry) => entry.name === "test_browser_session" && entry.value,
  );
  assert.ok(cookie?.httpOnly);
  assert.equal(cookie.sameSite, "Lax");
  const headers = { cookie: `${cookie.name}=${cookie.value}`, origin };
  const stored = await db("asmblyr_auth_sessions")
    .where({ user_id: user.id })
    .first();
  assert.match(stored.browser_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.browser_hash, cookie.value);
  assert.equal(
    (await db("asmblyr_auth_tokens").where({ session_id: stored.id })).length,
    0,
  );
  const reads = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? replica : app).inject({
        method: "GET",
        url: "/api/users/me",
        headers,
      }),
    ),
  );
  assert.ok(reads.every((read) => read.statusCode === 200));
  assert.ok(reads.every((read) => !read.headers["set-cookie"]));
  const write = {
    method: "PATCH" as const,
    url: "/api/users/me/preferences",
    payload: { locale: "en" },
  };
  assert.equal(
    (await app.inject({ ...write, headers: { cookie: headers.cookie } }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        ...write,
        headers: { ...headers, origin: "https://evil.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal((await app.inject({ ...write, headers })).statusCode, 200);
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { ...headers, authorization: "Bearer invalid" },
      })
    ).statusCode,
    401,
  );
  const duplicate = `${headers.cookie}; ${headers.cookie}`;
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { cookie: duplicate },
      })
    ).statusCode,
    401,
  );
  await db("asmblyr_users")
    .where({ id: user.id })
    .update({ status: "disabled" });
  assert.equal(
    (await replica.inject({ method: "GET", url: "/users/me", headers }))
      .statusCode,
    401,
  );
  await db("asmblyr_users")
    .where({ id: user.id })
    .update({ status: "active", superuser: false });
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/users", headers }))
      .statusCode,
    403,
  );
  const api = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  assert.equal(api.statusCode, 200, api.body);
  assert.match(api.json().accessToken, /^asm_at_/);
  assert.equal(api.headers["set-cookie"], undefined);
  const refreshed = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    payload: { refreshToken: api.json().refreshToken },
  });
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/browser/logout",
    headers,
  });
  assert.equal(logout.statusCode, 204, logout.body);
  assert.equal(
    (await replica.inject({ method: "GET", url: "/api/users/me", headers }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/users/me",
        headers: { authorization: `Bearer ${refreshed.json().accessToken}` },
      })
    ).statusCode,
    200,
  );
  const expired = await createBrowserSession(
    db,
    await issueUserTokens(db, user.id),
  );
  await db("asmblyr_auth_sessions")
    .where({ user_id: user.id })
    .update({ expires_at: new Date(Date.now() - 1000) });
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/users/me",
        headers: { cookie: `test_browser_session=${expired}` },
      })
    ).statusCode,
    401,
  );
});

test("invitation and passkey login use browser-bound cookies without exposing API tokens", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const invitation = await inviteUser(db, `${randomUUID()}@example.test`);
  t.after(async () => {
    await app.close();
    await db("asmblyr_users").where({ id: invitation.user.id }).delete();
    await db.destroy();
  });
  const claimed = await app.inject({
    method: "POST",
    url: "/api/auth/browser/invitations/claim",
    headers: { origin },
    payload: { token: invitation.invitationToken },
  });
  assert.equal(claimed.statusCode, 200, claimed.body);
  assert.deepEqual(claimed.json(), { ok: true });
  const session = claimed.cookies.find(
    (entry) => entry.name === "asmblyr_session" && entry.value,
  )!;
  const headers = { origin, cookie: `asmblyr_session=${session.value}` };
  const key = virtualPasskey();
  const options = await app.inject({
    method: "POST",
    url: "/api/users/me/passkeys/options",
    headers,
    payload: {},
  });
  assert.equal(options.statusCode, 200, options.body);
  const registered = await app.inject({
    method: "POST",
    url: "/api/users/me/passkeys",
    headers,
    payload: {
      challengeId: options.json().challengeId,
      response: key.registration(options.json().options.challenge),
      name: "Browser test",
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);
  const auth = await app.inject({
    method: "POST",
    url: "/api/auth/browser/passkeys/options",
    headers: { origin },
    payload: {},
  });
  const challenge = auth.cookies.find((entry) =>
    entry.name.endsWith("_passkey_challenge"),
  )!;
  const payload = {
    challengeId: auth.json().challengeId,
    response: key.authentication(auth.json().options.challenge),
  };
  const noProof = await app.inject({
    method: "POST",
    url: "/api/auth/browser/passkeys/login",
    headers: { origin },
    payload,
  });
  assert.equal(noProof.statusCode, 401);
  const valid = await app.inject({
    method: "POST",
    url: "/api/auth/browser/passkeys/login",
    headers: { origin, cookie: `${challenge.name}=${challenge.value}` },
    payload,
  });
  assert.equal(valid.statusCode, 200, valid.body);
  assert.deepEqual(valid.json(), { ok: true });
});
