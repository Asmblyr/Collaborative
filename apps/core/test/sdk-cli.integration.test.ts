import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("browser CLI grants are PKCE-bound, one-use, short-lived, session-bound and schema-only", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const [user] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test`, superuser: true })
    .returning("id");
  const pair = await issueUserTokens(db, user.id);
  t.after(async () => {
    await app.close();
    await db("asmblyr_users").where({ id: user.id }).delete();
    await db.destroy();
  });
  const verifier = randomBytes(32).toString("base64url");
  const input = {
    redirectUri: "http://127.0.0.1:54321/callback",
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(32).toString("base64url"),
  };
  const auth = { authorization: `Bearer ${pair.accessToken}` };
  const call = (url: string, payload: object, headers = {}) =>
    app.inject({ method: "POST", url, payload, headers });
  assert.equal(
    (await app.inject({ method: "GET", url: "/auth/cli/config" })).json().data
      .authorizationUrl,
    "http://localhost:3000/sdk/connect",
  );
  assert.equal((await call("/auth/cli/authorize", input)).statusCode, 401);
  for (const redirectUri of [
    "https://example.test/callback",
    "http://localhost:54321/callback",
    "http://127.0.0.1:54321/callback?x=1",
    "http://127.0.0.1:54321/other",
  ]) {
    assert.equal(
      (await call("/auth/cli/authorize", { ...input, redirectUri }, auth))
        .statusCode,
      400,
    );
  }
  async function authorize() {
    const response = await call("/auth/cli/authorize", input, auth);
    assert.equal(response.statusCode, 200, response.body);
    const callback = new URL(response.json().data.redirectTo);
    assert.equal(callback.searchParams.get("state"), input.state);
    return callback.searchParams.get("code")!;
  }
  const code = await authorize();
  const exchange = { code, verifier, redirectUri: input.redirectUri };
  assert.equal(
    (await call("/auth/cli/token", { ...exchange, verifier: "x".repeat(43) }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await call("/auth/cli/token", {
        ...exchange,
        redirectUri: "http://127.0.0.1:54322/callback",
      })
    ).statusCode,
    401,
  );
  const responses = await Promise.all([
    call("/auth/cli/token", exchange),
    call("/auth/cli/token", exchange),
  ]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 401]);
  const result = responses.find((r) => r.statusCode === 200)!.json().data;
  assert.equal(result.scope, "schema:read");
  assert.equal(result.expiresIn, 600);
  const scoped = { authorization: `Bearer ${result.accessToken}` };
  const schema = await app.inject({
    method: "GET",
    url: "/schema",
    headers: scoped,
  });
  assert.equal(schema.statusCode, 200, schema.body);
  assert.equal(schema.headers["cache-control"], "private, no-store");
  for (const url of ["/collections", "/users/me", "/items/asmblyr_users"]) {
    assert.equal(
      (await app.inject({ method: "GET", url, headers: scoped })).statusCode,
      401,
    );
  }
  assert.equal(
    (await call("/auth/cli/authorize", input, scoped)).statusCode,
    401,
  );
  const persisted = await db("asmblyr_cli_grants")
    .where({ code_hash: createHash("sha256").update(code).digest("hex") })
    .first();
  assert.ok(!JSON.stringify(persisted).includes(result.accessToken));
  await db("asmblyr_cli_grants")
    .where({ code_hash: persisted.code_hash })
    .update({ expires_at: new Date(Date.now() - 1000) });
  assert.equal(
    (await app.inject({ method: "GET", url: "/schema", headers: scoped }))
      .statusCode,
    401,
  );
  const expiring = await authorize();
  await db("asmblyr_cli_grants")
    .where({ code_hash: createHash("sha256").update(expiring).digest("hex") })
    .update({ code_expires_at: new Date(Date.now() - 1000) });
  assert.equal(
    (await call("/auth/cli/token", { ...exchange, code: expiring })).statusCode,
    401,
  );
  const revokable = await authorize();
  const issued = await call("/auth/cli/token", {
    ...exchange,
    code: revokable,
  });
  assert.equal(issued.statusCode, 200);
  await app.inject({ method: "POST", url: "/auth/logout", headers: auth });
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/schema",
        headers: { authorization: `Bearer ${issued.json().data.accessToken}` },
      })
    ).statusCode,
    401,
  );
  const bucketKey = `credentials:${createHash("sha256").update("127.0.0.1").digest("hex")}`;
  const bucket = await db("asmblyr_request_buckets")
    .where({ key: bucketKey })
    .first();
  assert.ok(bucket);
  try {
    await db("asmblyr_request_buckets")
      .where({ key: bucketKey })
      .update({ count: 100, expires_at: new Date(Date.now() + 60000) });
    for (const url of ["/auth/cli/authorize", "/auth/cli/token"]) {
      const limited = await call(url, {});
      assert.equal(limited.statusCode, 429);
      assert.equal(limited.headers["retry-after"], "60");
    }
  } finally {
    await db("asmblyr_request_buckets")
      .where({ key: bucketKey })
      .update({ count: bucket.count, expires_at: bucket.expires_at });
  }
});
