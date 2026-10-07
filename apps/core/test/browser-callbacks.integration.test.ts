import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { SsoService } from "../src/auth/sso/service.js";
import { SsoProtocol } from "../src/auth/sso/protocol.js";
import { fakeSsoProvider } from "./support/sso-provider.js";
import { googleWorkspaceFixture } from "./support/google-workspace.js";

const origin = "http://localhost:3000";

test("Core owns SSO browser redirects, linking, login and replay protection", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const fake = await fakeSsoProvider();
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sso: new SsoService([fake.provider], new SsoProtocol(fake.transport)),
  });
  const [user] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test` })
    .returning("id");
  t.after(async () => {
    await app.close();
    await db("asmblyr_users").where({ id: user.id }).delete();
    await db.destroy();
  });
  const session = await createBrowserSession(
    db,
    await issueUserTokens(db, user.id),
  );
  const headers = {
    origin,
    cookie: `asmblyr_session=${session}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  const rejected = await app.inject({
    method: "POST",
    url: "/sign/sso/okkam",
    headers: { ...headers, origin: "https://evil.example" },
    payload: "intent=link",
  });
  assert.equal(rejected.statusCode, 403);
  for (const intent of ["link", "login"]) {
    const start = await app.inject({
      method: "POST",
      url: "/sign/sso/okkam",
      headers,
      payload: `intent=${intent}&next=%2Fadmin%2Fcollections`,
    });
    assert.equal(start.statusCode, 303, start.body);
    const query = fake.authorize(
      String(start.headers.location),
      "browser-person",
    );
    const proof = start.cookies
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    const url = `/sign/sso/okkam/callback?${query}`;
    const missing = await app.inject({
      method: "GET",
      url,
      headers: { cookie: headers.cookie },
    });
    assert.match(String(missing.headers.location), /SSO_INVALID_FLOW/);
    const finish = await app.inject({
      method: "GET",
      url,
      headers: {
        cookie: `${headers.cookie}; ${proof}`,
        "sec-fetch-site": "cross-site",
      },
    });
    assert.equal(finish.statusCode, 303, finish.body);
    assert.equal(
      finish.headers.location,
      intent === "link"
        ? "/settings?tab=security&sso=SSO_LINKED"
        : "/admin/collections",
    );
    assert.equal(finish.headers["referrer-policy"], "no-referrer");
    if (intent === "login")
      assert.ok(
        finish.cookies.some(
          (entry) => entry.name === "asmblyr_session" && entry.value,
        ),
      );
    const replay = await app.inject({
      method: "GET",
      url,
      headers: { cookie: `${headers.cookie}; ${proof}` },
    });
    assert.match(String(replay.headers.location), /sso=SSO_/);
  }
});

test("Google start hides its proof and Core callback checks both browser and owner", async (t) => {
  const fixture = await googleWorkspaceFixture(t);
  const { app, db, owner, outsider } = fixture;
  const session = await createBrowserSession(
    db,
    await issueUserTokens(db, owner!),
  );
  const foreign = await createBrowserSession(
    db,
    await issueUserTokens(db, outsider!),
  );
  const headers = { origin, cookie: `asmblyr_session=${session}` };
  const start = await app.inject({
    method: "POST",
    url: "/api/auth/browser/google/start",
    headers,
    payload: {},
  });
  assert.equal(start.statusCode, 200, start.body);
  assert.deepEqual(Object.keys(start.json().data), ["url"]);
  const proof = start.cookies.find(
    (entry) => entry.name === "asmblyr_google_connection",
  )!;
  assert.ok(proof.httpOnly);
  const query = `state=${new URL(start.json().data.url).searchParams.get("state")}&code=test`;
  const url = `/connections/google/callback?${query}`;
  for (const cookie of [
    headers.cookie,
    `asmblyr_session=${foreign}; ${proof.name}=${proof.value}`,
  ]) {
    const rejected = await app.inject({
      method: "GET",
      url,
      headers: { cookie },
    });
    assert.match(String(rejected.headers.location), /connection=failed$/);
  }
  const cookie = `${headers.cookie}; ${proof.name}=${proof.value}`;
  const finish = await app.inject({ method: "GET", url, headers: { cookie } });
  assert.match(String(finish.headers.location), /connection=connected$/);
  const replay = await app.inject({ method: "GET", url, headers: { cookie } });
  assert.match(String(replay.headers.location), /connection=failed$/);
});
