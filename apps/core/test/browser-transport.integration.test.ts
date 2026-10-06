import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import knex from "knex";
import { useAsmblyr } from "@asmblyr-collaborative/kit";
import { setCookie } from "h3";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { publicServer } from "./support/public-server.js";
import { oauthFixture } from "./support/oauth-provider.js";

test("public browser transport preserves private file bytes and isolates plugin credentials", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const [user] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test`, superuser: true })
    .returning("id");
  const token = await createBrowserSession(
    db,
    await issueUserTokens(db, user.id),
  );
  const storage = new Map<string, Buffer>();
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sessionCookiePrefix: "custom",
    fileStorage: {
      id: "browser-test",
      async put(key, bytes) {
        storage.set(key, bytes);
      },
      async get(key) {
        return Readable.from(storage.get(key)!);
      },
      async delete(key) {
        storage.delete(key);
      },
    },
    plugins: [
      {
        name: "example",
        definition: {},
        endpoints: [
          {
            method: "POST",
            path: "/example/inspect",
            handler: async (event) => {
              for (const name of [
                "custom_session",
                "custom_passkey_challenge",
                "asmblyr_oidc_session",
                "plugin_choice",
              ])
                setCookie(event, name, "attempt", { httpOnly: true });
              return {
                actor: useAsmblyr(event).actor.id,
                authorization: event.req.headers.get("authorization"),
                cookie: event.req.headers.get("cookie"),
                bytes: [...new Uint8Array(await event.req.arrayBuffer())],
              };
            },
          },
        ],
      },
    ],
  });
  t.after(async () => {
    await app.close();
    await db("asmblyr_file_events").where({ actor_id: user.id }).delete();
    await db("asmblyr_files").where({ uploaded_by: user.id }).delete();
    await db("asmblyr_users").where({ id: user.id }).delete();
    await db.destroy();
  });
  const base = await publicServer(t, app);
  const headers = {
    cookie: `custom_session=${token}`,
    origin: "http://localhost:3000",
  };
  const bytes = Buffer.from([0, 255, 128, 1, 13, 10]);
  const upload = await fetch(`${base}/api/files`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/octet-stream",
      "x-file-name": "browser.bin",
    },
    body: bytes,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const fileId = (await upload.json()).data.id;
  const download = await fetch(`${base}/api/files/${fileId}/content`, {
    headers,
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.match(download.headers.get("content-disposition")!, /attachment/);
  assert.match(download.headers.get("cache-control")!, /no-store/);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    (await fetch(`${base}/api/files/${fileId}/content`)).status,
    401,
  );
  const plugin = await fetch(`${base}/api/example/inspect`, {
    method: "POST",
    headers: {
      ...headers,
      cookie: `${headers.cookie}; custom_passkey_challenge=private; asmblyr_oidc_session=private; plugin_choice=keep`,
      "content-type": "application/octet-stream",
    },
    body: bytes,
  });
  assert.equal(plugin.status, 200, await plugin.clone().text());
  assert.deepEqual(await plugin.json(), {
    actor: user.id,
    authorization: null,
    cookie: "plugin_choice=keep",
    bytes: [...bytes],
  });
  assert.equal(plugin.headers.getSetCookie().length, 1);
  assert.match(plugin.headers.getSetCookie()[0], /^plugin_choice=/);
  assert.equal(
    (await fetch(`${base}/api/files/${fileId}`, { method: "DELETE", headers }))
      .status,
    204,
  );
});

test("browser OAuth consent retains the provider cookie path, rejects CSRF and exchanges the code", async (t) => {
  const fixture = await oauthFixture();
  t.after(fixture.close);
  const token = await createBrowserSession(
    fixture.db,
    await issueUserTokens(fixture.db, fixture.users[0]),
  );
  const flow = await fixture.flow();
  const uid = flow.details.json().data.uid;
  const path = `/oauth/complete/${uid}`;
  const protocolCookies = flow.start.cookies.filter((cookie) =>
    path.startsWith(cookie.path ?? "/"),
  );
  assert.ok(
    protocolCookies.some(
      (cookie) => cookie.name === "asmblyr_oidc_interaction",
    ),
  );
  const cookie = [
    `asmblyr_session=${token}`,
    ...protocolCookies.map((entry) => `${entry.name}=${entry.value}`),
  ].join("; ");
  const base = await publicServer(t, fixture.app);
  const request = {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: "https://foreign.example",
    },
    body: JSON.stringify({ approve: true, userId: fixture.users[0] }),
  };
  assert.equal((await fetch(base + path, request)).status, 403);
  const result = await fetch(base + path, {
    ...request,
    headers: { ...request.headers, origin: "http://localhost:3000" },
  });
  assert.equal(result.status, 200, await result.clone().text());
  const resume = await flow.resume((await result.json()).data.redirectTo);
  assert.equal(resume.statusCode, 303, resume.body);
  const code = new URL(String(resume.headers.location)).searchParams.get(
    "code",
  );
  assert.ok(code);
  const exchanged = await fixture.exchange(code, flow.verifier);
  assert.equal(exchanged.statusCode, 200, exchanged.body);
  assert.ok(exchanged.json().id_token);
});
