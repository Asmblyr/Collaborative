import "./support/require-test-database.js";
import { createApp } from "../src/app.js";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { publicServer } from "./support/public-server.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import argon2 from "argon2";
import { issueUserTokens } from "../src/auth/tokens.js";
import { passwordOptions } from "../src/auth/users.js";

// Runs against scripts/test.mjs disposable PostgreSQL and the real public Core listener.
test("browser settings preserve permissions, credentials and Origin checks", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const origin = await publicServer(t, app);
  t.after(() => app.close());
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const suffix = randomUUID();
  const password = `test-${randomUUID()}`;
  const users = await db("asmblyr_users")
    .insert([
      { email: `ui-member-${suffix}@example.test`, superuser: false },
      { email: `ui-admin-${suffix}@example.test`, superuser: true },
    ])
    .returning("id");
  let serviceId: string | undefined;
  const collectionName = `test_ui_preferences_${suffix.replaceAll("-", "").slice(0, 8)}`;
  const member = await createBrowserSession(
    db,
    await issueUserTokens(db, users[0].id),
  );
  const admin = await createBrowserSession(
    db,
    await issueUserTokens(db, users[1].id),
  );
  await db("asmblyr_password_credentials").insert({
    user_id: users[0].id,
    password_hash: await argon2.hash(password, passwordOptions),
  });
  function headers(pair = member, withBody = true) {
    return {
      cookie: `asmblyr_session=${pair}`,
      origin: "http://localhost:3000",
      ...(withBody ? { "content-type": "application/json" } : {}),
    };
  }
  try {
    const blocked = await fetch(`${origin}/api/users/me`, {
      method: "PATCH",
      headers: { ...headers(), origin: "https://foreign.example.test" },
      body: JSON.stringify({ displayName: "forbidden" }),
    });
    assert.equal(blocked.status, 403);
    const profile = await fetch(`${origin}/api/users/me`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ displayName: "UI smoke profile" }),
    });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).data.displayName, "UI smoke profile");
    const created = await fetch(`${origin}/api/service-accounts`, {
      method: "POST",
      headers: headers(admin),
      body: JSON.stringify({ name: `UI smoke ${suffix}` }),
    });
    assert.equal(created.status, 201);
    serviceId = (await created.json()).data.id;
    const issued = await fetch(
      `${origin}/api/service-accounts/${serviceId}/keys`,
      {
        method: "POST",
        headers: headers(admin),
        body: JSON.stringify({ name: "UI smoke key", expiresInDays: 7 }),
      },
    );
    assert.equal(issued.status, 201);
    assert.equal(issued.headers.get("cache-control"), "no-store");
    const key = (await issued.json()).data;
    assert.equal(typeof key.secret, "string");
    const revoked = await fetch(
      `${origin}/api/service-accounts/${serviceId}/keys/${key.id}`,
      {
        method: "DELETE",
        headers: headers(admin, false),
      },
    );
    assert.equal(revoked.status, 204);
    const sessions = await fetch(`${origin}/api/users/me/sessions`, {
      headers: headers(),
    });
    assert.equal(sessions.status, 200);
    assert.ok(
      (await sessions.json()).data.some(
        (session: { current: boolean }) => session.current,
      ),
    );
    const theme = await fetch(`${origin}/api/users/me/preferences`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ theme: "dark" }),
    });
    assert.equal(theme.status, 200);
    const federation = await fetch(
      `${origin}/api/service-accounts/${serviceId}/federations`,
      {
        method: "POST",
        headers: headers(admin),
        body: JSON.stringify({
          name: "UI smoke federation",
          projectId: "123",
          projectPath: "test/project",
          ref: "main",
        }),
      },
    );
    assert.equal(federation.status, 201);
    const federationId = (await federation.json()).data.id;
    assert.equal(
      (
        await fetch(
          `${origin}/api/service-accounts/${serviceId}/federations/${federationId}`,
          {
            method: "DELETE",
            headers: headers(admin, false),
          },
        )
      ).status,
      204,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/collections`, {
          method: "POST",
          headers: headers(admin),
          body: JSON.stringify({
            name: collectionName,
            fields: [{ name: "title", type: "text" }],
          }),
        })
      ).status,
      201,
    );
    const preferences = await fetch(
      `${origin}/api/users/me/table-preferences/${collectionName}`,
      {
        method: "PATCH",
        headers: headers(admin),
        body: JSON.stringify({
          pageSize: 50,
          sort: { field: "title", direction: "desc" },
          columns: { order: ["title", "id"], hidden: ["id"] },
        }),
      },
    );
    assert.equal(preferences.status, 200);
    const changed = await fetch(`${origin}/api/users/me/password`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        currentPassword: password,
        newPassword: `next-${randomUUID()}`,
      }),
    });
    assert.equal(changed.status, 204);
    assert.equal(
      (await fetch(`${origin}/api/users/me`, { headers: headers() })).status,
      401,
    );
  } finally {
    await db("asmblyr_security_events")
      .whereIn(
        "actor_id",
        users.map((user) => user.id),
      )
      .delete();
    if (serviceId)
      await db("asmblyr_service_accounts").where({ id: serviceId }).delete();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((user) => user.id),
      )
      .delete();
    await db.schema.dropTableIfExists(collectionName);
    await db("asmblyr_collections").where({ name: collectionName }).delete();
    await db.destroy();
  }
});
