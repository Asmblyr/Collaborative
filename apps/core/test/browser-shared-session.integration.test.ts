import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { startBrowserSession } from "../src/auth/browser/sessions.js";
import { browserConfig, setCookie } from "../src/auth/browser/cookies.js";

test("only the main session uses the shared domain, with exact logout and ambiguous cookie rejection", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const origin = "https://admin.example.test";
  const config = browserConfig(origin, "collaborative", "example.test");
  const [user] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test` })
    .returning("id");
  const options = {
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sessionCookiePrefix: config.prefix,
    sessionCookieDomain: config.sessionDomain,
    passkeys: { origin, rpId: "admin.example.test", rpName: "Test" },
  };
  const app = createApp(options);
  const replica = createApp(options);
  app.post("/test/start", async (_request, reply) => {
    await startBrowserSession(
      db,
      await issueUserTokens(db, user.id),
      reply,
      config,
    );
    return { ok: true };
  });
  app.get("/test/challenge", (_request, reply) => {
    setCookie(reply, config, "collaborative_passkey_challenge", "proof", 300);
    return { ok: true };
  });
  t.after(async () => {
    await app.close();
    await replica.close();
    await db.destroy();
  });
  const started = await app.inject({ method: "POST", url: "/test/start" });
  const live = started.cookies.filter(
    (cookie) => cookie.name === "collaborative_session" && cookie.value,
  );
  assert.equal(live.length, 1);
  assert.equal(live[0].domain, "example.test");
  assert.equal(live[0].secure, true);
  assert.equal(live[0].httpOnly, true);
  assert.equal(live[0].sameSite, "Lax");
  assert.ok(live[0].maxAge! > 29 * 24 * 60 * 60);
  assert.ok(
    started.cookies.some(
      (cookie) =>
        cookie.name === "collaborative_session" &&
        !cookie.domain &&
        !cookie.value,
    ),
  );
  assert.equal(
    (await app.inject({ url: "/test/challenge" })).cookies[0].domain,
    undefined,
  );
  const cookie = `collaborative_session=${live[0].value}`;
  assert.equal(
    (await replica.inject({ url: "/users/me", headers: { cookie } }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/users/me",
        headers: { cookie: `${cookie}; ${cookie}` },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/auth/browser/logout",
        headers: { cookie, origin: "https://flows.example.test" },
      })
    ).statusCode,
    403,
  );
  const logout = await app.inject({
    method: "POST",
    url: "/auth/browser/logout",
    headers: { cookie, origin },
  });
  assert.equal(logout.statusCode, 204);
  assert.ok(
    logout.cookies.some(
      (entry) =>
        entry.name === "collaborative_session" &&
        entry.domain === "example.test" &&
        !entry.value,
    ),
  );
  assert.equal(
    (await replica.inject({ url: "/users/me", headers: { cookie } }))
      .statusCode,
    401,
  );
});
