import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@asmblyr-collaborative/sdk";
import type { PresenceScope } from "@asmblyr-collaborative/contracts";
import { createApp } from "../src/app.js";
import { authenticateAccess, issueUserTokens } from "../src/auth/tokens.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

type Fixture = Awaited<ReturnType<typeof pluginItemsFixture>>;
function touch(
  f: Fixture,
  clientId: string,
  scope: PresenceScope,
  token = f.adminToken,
  status = 200,
) {
  return f.call("POST", "/presence", { clientId, scope }, status, token);
}
function record(f: Fixture, id = "2"): PresenceScope {
  return { kind: "record", collection: f.collection, id };
}

test("SDK presence shares people across Core instances, deduplicates views and isolates scopes", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  await f
    .db("asmblyr_users")
    .where({ id: f.admin.id })
    .update({ display_name: "Администратор" });
  await f
    .db("asmblyr_users")
    .where({ id: f.member.id })
    .update({ display_name: "Редактор" });
  const second = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  t.after(() => second.close());
  const baseUrl = await second.listen({ host: "127.0.0.1", port: 0 });
  const client = createClient({ baseUrl, accessToken: f.memberToken });
  const own = randomUUID();
  const other = randomUUID();
  await touch(f, own, record(f));
  const result = await client.presence.touch({
    clientId: other,
    scope: record(f),
  });
  assert.equal(result.data.total, 2);
  assert.equal(result.data.participants[0].id, f.member.id);
  assert.equal(result.data.participants[0].self, true);
  assert.equal(result.data.participants[1].displayName, "Администратор");
  assert.deepEqual(Object.keys(result.data.participants[0]).sort(), [
    "displayName",
    "id",
    "pictureUrl",
    "self",
    "views",
  ]);
  await client.presence.touch({ clientId: randomUUID(), scope: record(f) });
  const same = await touch(f, own, record(f));
  assert.equal(same.data.total, 2);
  assert.equal(
    same.data.participants.find((p: { id: string }) => p.id === f.member.id)
      .views,
    2,
  );
  const isolated = await touch(f, randomUUID(), {
    kind: "collection",
    collection: f.collection,
  });
  assert.equal(isolated.data.total, 1);
  assert.equal((await touch(f, randomUUID(), record(f, "1"))).data.total, 1);
  await client.presence.leave(other);
  assert.equal((await touch(f, own, record(f))).data.participants[1].views, 1);
  const response = await f.app.inject({
    method: "POST",
    url: "/presence",
    headers: { authorization: `Bearer ${f.adminToken}` },
    payload: { clientId: own, scope: record(f) },
  });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("leaving is idempotent and cannot remove another session's view", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const sharedId = randomUUID();
  await touch(f, sharedId, record(f));
  await touch(f, sharedId, record(f), f.memberToken);
  await f.call(
    "DELETE",
    `/presence/${sharedId}`,
    undefined,
    204,
    f.memberToken,
  );
  await f.call(
    "DELETE",
    `/presence/${sharedId}`,
    undefined,
    204,
    f.memberToken,
  );
  const session = await authenticateAccess(f.db, `Bearer ${f.adminToken}`);
  assert.equal(
    (
      await f
        .db("asmblyr_presence")
        .where({ session_id: session.sessionId, client_id: sharedId })
    ).length,
    1,
  );
  await f.call("DELETE", `/presence/${sharedId}`, undefined, 204);
  assert.equal(
    (await f.db("asmblyr_presence").where({ client_id: sharedId })).length,
    0,
  );
});

test("every renewal checks current row access and removes a view when access is lost", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const viewer = randomUUID();
  const admin = randomUUID();
  await touch(f, viewer, record(f, "1"), f.memberToken);
  await f.call("PATCH", `/permissions/${f.permissionId}`, {
    fields: ["title"],
    rowFilter: {
      logic: "and",
      children: [
        {
          field: "title",
          op: "eq",
          value: { kind: "literal", value: "Alpha" },
        },
      ],
    },
  });
  await touch(f, viewer, record(f, "1"), f.memberToken, 404);
  assert.equal((await touch(f, admin, record(f, "1"))).data.total, 1);
  await touch(f, viewer, record(f), f.memberToken);
  assert.equal((await touch(f, admin, record(f))).data.total, 2);
  await touch(f, randomUUID(), record(f), f.outsiderToken, 403);
  await touch(f, randomUUID(), record(f, "999999"), f.adminToken, 404);
  await f.call(
    "DELETE",
    `/policies/${f.policyId}/users/${f.member.id}`,
    undefined,
    204,
  );
  await touch(f, viewer, record(f), f.memberToken, 403);
  assert.equal((await touch(f, admin, record(f))).data.total, 1);
});

test("expired leases, revoked sessions and disabled users disappear", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const extra = await issueUserTokens(f.db, f.member.id);
  const memberSession = await authenticateAccess(
    f.db,
    `Bearer ${extra.accessToken}`,
  );
  const viewer = randomUUID();
  const admin = randomUUID();
  await touch(f, viewer, record(f), extra.accessToken);
  await f
    .db("asmblyr_auth_sessions")
    .where({ id: memberSession.sessionId })
    .update({ revoked_at: f.db.fn.now() });
  assert.equal((await touch(f, admin, record(f))).data.total, 1);
  await touch(f, randomUUID(), record(f), f.memberToken);
  await f
    .db("asmblyr_users")
    .where({ id: f.member.id })
    .update({ status: "disabled" });
  assert.equal((await touch(f, admin, record(f))).data.total, 1);
  await f
    .db("asmblyr_users")
    .where({ id: f.member.id })
    .update({ status: "active" });
  await f
    .db("asmblyr_presence")
    .where({ client_id: viewer })
    .update({
      expires_at: f.db.raw("CURRENT_TIMESTAMP - INTERVAL '1 second'"),
    });
  await touch(f, admin, record(f));
  assert.equal(
    (await f.db("asmblyr_presence").where({ client_id: viewer })).length,
    0,
  );
});

test("presence is human-only, validates scopes and mirrors protected page access", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const clientId = randomUUID();
  await f.call("POST", "/presence", {}, 401, null);
  await f.call("DELETE", `/presence/${clientId}`, undefined, 401, null);
  await f.call(
    "POST",
    "/presence",
    { clientId, scope: record(f), userId: f.admin.id },
    400,
  );
  await f.call(
    "POST",
    "/presence",
    { clientId, scope: { kind: "page", page: "/search?q=private" } },
    400,
  );
  await f.call(
    "POST",
    "/presence",
    { clientId, scope: { kind: "collection", collection: 4 } },
    400,
  );
  await touch(f, clientId, { kind: "page", page: "/settings" }, f.memberToken);
  await touch(f, clientId, { kind: "page", page: "/" }, f.memberToken);
  await touch(
    f,
    clientId,
    { kind: "page", page: "/admin/collections" },
    f.memberToken,
    403,
  );
  await touch(f, clientId, { kind: "page", page: "/admin/collections" });
  await touch(
    f,
    clientId,
    { kind: "page", page: "/admin/settings/integrations" },
    f.memberToken,
    403,
  );
  await touch(f, clientId, {
    kind: "page",
    page: "/admin/settings/integrations",
  });
  await touch(
    f,
    clientId,
    { kind: "page", page: "/system-settings/plugins" },
    f.memberToken,
    403,
  );
  for (const page of [
    "/system-settings/users",
    "/system-settings/policies",
    "/system-settings/services",
  ] as const) {
    await touch(f, clientId, { kind: "page", page }, f.memberToken, 403);
    await touch(f, clientId, { kind: "page", page });
  }
  await touch(
    f,
    clientId,
    { kind: "page", page: "/files" },
    f.memberToken,
    403,
  );
  await touch(f, clientId, { kind: "page", page: "/files" });
  const service = (
    await f.call("POST", "/service-accounts", { name: "Presence service" }, 201)
  ).data;
  const key = (
    await f.call(
      "POST",
      `/service-accounts/${service.id}/keys`,
      { name: "Presence test" },
      201,
    )
  ).data;
  const token = (
    await f.call("POST", "/auth/service-token", { key: key.secret }, 200, null)
  ).accessToken;
  await touch(f, clientId, record(f), token, 403);
  await f.call("DELETE", `/presence/${clientId}`, undefined, 403, token);
});

test("concurrent view registration respects the per-session bound and permits renewals", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const clients = Array.from({ length: 33 }, () => randomUUID());
  const responses = await Promise.all(
    clients.map((clientId) =>
      f.app.inject({
        method: "POST",
        url: "/presence",
        headers: { authorization: `Bearer ${f.adminToken}` },
        payload: { clientId, scope: record(f) },
      }),
    ),
  );
  assert.equal(responses.filter((r) => r.statusCode === 200).length, 32);
  assert.equal(responses.filter((r) => r.statusCode === 429).length, 1);
  const accepted = clients[responses.findIndex((r) => r.statusCode === 200)];
  await touch(f, accepted, record(f));
  await f.call("DELETE", `/presence/${accepted}`, undefined, 204);
  const denied = clients[responses.findIndex((r) => r.statusCode === 429)];
  await touch(f, denied, record(f));
});
