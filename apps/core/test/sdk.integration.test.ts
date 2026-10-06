import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createClient } from "@asmblyr-collaborative/sdk";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("HTTP SDK and local kit read the same Core data and permissions", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const {
    app,
    call,
    collection,
    memberToken,
    outsiderToken,
    member,
    db,
    adminToken,
  } = fixture;
  const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = createClient({ baseUrl, accessToken: memberToken });
  const options = {
    fields: ["title"],
    limit: 2,
    sort: "title",
    direction: "desc" as const,
  };
  assert.deepEqual(
    await client.items.list(collection, options),
    await call(
      "POST",
      "/reader/list",
      { collection, options },
      200,
      memberToken,
    ),
  );
  assert.deepEqual(
    await client.items.get(collection, 1, { fields: ["title"] }),
    await call(
      "POST",
      "/reader/get",
      { collection, id: 1, options: { fields: ["title"] } },
      200,
      memberToken,
    ),
  );
  assert.deepEqual(
    (await client.items.get(collection, 1, { fields: [] })).data,
    { id: 1 },
  );
  assert.deepEqual((await client.items.list(collection, { fields: [] })).data, [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ]);
  const me = (await client.users.me()).data;
  assert.equal(me.id, member.id);
  assert.equal(me.superuser, false);
  assert.equal(typeof me.createdAt, "string");
  assert.deepEqual(Object.keys(me).sort(), [
    "avatarId",
    "createdAt",
    "description",
    "displayName",
    "email",
    "firstName",
    "hasPassword",
    "id",
    "lastActiveAt",
    "lastLoginAt",
    "lastName",
    "pictureUrl",
    "superuser",
    "updatedAt",
  ]);
  await assert.rejects(
    client.items.get(collection, 1, { fields: ["secret"] }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 403 &&
      Boolean(error.requestId),
  );
  await assert.rejects(client.items.get(collection, 999), { status: 404 });
  await assert.rejects(client.items.list(collection, { limit: 101 }), {
    status: 400,
  });
  const outsider = createClient({ baseUrl, accessToken: outsiderToken });
  await assert.rejects(outsider.items.list(collection), { status: 403 });
  await assert.rejects(createClient({ baseUrl }).users.me(), { status: 401 });
  const admin = createClient({ baseUrl, accessToken: adminToken });
  const record = (await admin.items.get(collection, 1)).data;
  assert.equal(typeof record.created_at, "string");
  assert.equal(record.secret, "classified");
  await db("asmblyr_auth_sessions")
    .where({ user_id: member.id })
    .update({ revoked_at: db.fn.now() });
  await assert.rejects(client.items.list(collection), { status: 401 });
});
