import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import type { HTTPMethods } from "fastify";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("consumer profile fields reuse row policies, validation and schema while protecting ownership", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const users = await db("asmblyr_users")
    .insert(
      [true, false, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const headers = await Promise.all(
    users.map(async (user) => ({
      authorization: `Bearer ${(await issueUserTokens(db, user.id)).accessToken}`,
    })),
  );
  const suffix = randomUUID().slice(0, 8);
  const name = `test_profile_${suffix}`,
    invalid = `test_bad_profile_${suffix}`,
    groups = `test_profile_groups_${suffix}`;
  const policies: string[] = [];
  t.after(async () => {
    await db("asmblyr_profile_extension")
      .where({ id: 1 })
      .update({ collection_id: null });
    for (const collection of [name, invalid, groups]) {
      await db.schema.dropTableIfExists(collection);
      await db("asmblyr_collections").where({ name: collection }).delete();
    }
    await db("asmblyr_policies").whereIn("id", policies).delete();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((user) => user.id),
      )
      .delete();
    await app.close();
    await db.destroy();
  });
  async function call(
    method: HTTPMethods,
    url: string,
    payload?: object,
    actor = 0,
    expected = 200,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: headers[actor],
      payload,
    });
    assert.equal(
      response.statusCode,
      expected,
      `${method} ${url}: ${response.body}`,
    );
    return response.statusCode === 204 ? null : response.json().data;
  }
  await call(
    "POST",
    "/collections",
    { name: groups, fields: [{ name: "label", type: "text" }] },
    0,
    201,
  );
  const group = await call(
    "POST",
    `/items/${groups}`,
    { label: "Readers" },
    0,
    201,
  );
  await call(
    "POST",
    "/collections",
    {
      name,
      fields: [
        { name: "bio", type: "text", nullable: true },
        { name: "private_note", type: "text", nullable: true },
      ],
    },
    0,
    201,
  );
  await call(
    "POST",
    `/collections/${name}/relations`,
    {
      name: "group",
      targetCollection: groups,
      nullable: true,
      onDelete: "restrict",
    },
    0,
    201,
  );
  await call("PUT", "/users/profile-extension", { collection: name }, 1, 403);
  await call(
    "PUT",
    "/users/profile-extension",
    { collection: "asmblyr_users" },
    0,
    403,
  );
  await call(
    "PUT",
    "/users/profile-extension",
    { collection: "plugin_private" },
    0,
    403,
  );
  await call("POST", "/collections", { name: invalid, fields: [] }, 0, 201);
  await call("POST", `/items/${invalid}`, {}, 0, 201);
  await call(
    "PUT",
    "/users/profile-extension",
    { collection: invalid },
    0,
    409,
  );
  assert.equal(
    (await call("PUT", "/users/profile-extension", { collection: name }))
      .collection,
    name,
  );
  const rowFilter = {
    logic: "and",
    children: [
      { field: "id", op: "eq", value: { kind: "context", path: "user.id" } },
    ],
  };
  const policy = await call(
    "POST",
    "/policies",
    {
      name: `Profile ${suffix}`,
      userIds: [users[1].id],
      permissions: [
        ...["read", "create", "update"].map((action) => ({
          collection: name,
          action,
          fields: ["bio", "group"],
          rowFilter,
        })),
        { collection: groups, action: "read", fields: ["*"] },
      ],
    },
    0,
    201,
  );
  policies.push(policy.id);
  assert.equal(await call("GET", "/users/me/extension", undefined, 2), null);
  await call(
    "PATCH",
    "/users/me/extension",
    { collection: name, values: { bio: "blocked" } },
    2,
    403,
  );
  assert.equal(
    (await call("GET", "/users/me/extension", undefined, 1)).exists,
    false,
  );
  await Promise.all(
    ["first", "second"].map((bio) =>
      call(
        "PATCH",
        "/users/me/extension",
        { collection: name, values: { bio, group: group.id } },
        1,
      ),
    ),
  );
  assert.equal((await db(name).where({ id: users[1].id })).length, 1);
  await db(name).where({ id: users[1].id }).update({ private_note: "hidden" });
  const profile = await call("GET", "/users/me/extension", undefined, 1);
  assert.equal(profile.data.id, users[1].id);
  assert.equal(profile.data.private_note, undefined);
  await call(
    "PATCH",
    "/users/me/extension",
    { collection: name, values: { private_note: "overwrite" } },
    1,
    403,
  );
  await call(
    "PATCH",
    "/users/me/extension",
    { collection: name, values: { id: users[2].id } },
    1,
    403,
  );
  await call(
    "PATCH",
    "/users/me/extension",
    { collection: invalid, values: {} },
    1,
    400,
  );
  await call(
    "PATCH",
    `/users/${users[0].id}/extension`,
    { collection: name, values: { bio: "intrude" } },
    1,
    403,
  );
  const hiddenPolicy = await call(
    "POST",
    "/policies",
    {
      name: `Hidden profile ${suffix}`,
      userIds: [users[2].id],
      permissions: [
        ...["read", "create", "update"].map((action) => ({
          collection: name,
          action,
          fields: ["bio"],
          rowFilter:
            action === "read"
              ? {
                  logic: "and",
                  children: [
                    ...rowFilter.children,
                    {
                      field: "bio",
                      op: "eq",
                      value: { kind: "literal", value: "readable" },
                    },
                  ],
                }
              : rowFilter,
        })),
      ],
    },
    0,
    201,
  );
  policies.push(hiddenPolicy.id);
  await call(
    "PATCH",
    "/users/me/extension",
    {
      collection: name,
      values: { bio: "not readable" },
    },
    2,
    403,
  );
  assert.equal(await db(name).where({ id: users[2].id }).first(), undefined);
  await call("PATCH", `/users/${users[2].id}/extension`, {
    collection: name,
    values: { bio: "other user" },
  });
  assert.equal(
    (await call("GET", "/users/me/extension", undefined, 2)).exists,
    false,
  );
  await call(
    "PATCH",
    "/users/me/extension",
    {
      collection: name,
      values: { bio: "readable" },
    },
    2,
    404,
  );
  assert.equal(
    (await db(name).where({ id: users[2].id }).first()).bio,
    "other user",
  );
  await call("GET", `/items/${name}/${users[2].id}`, undefined, 1, 404);
  await call("POST", `/items/${name}`, { bio: "orphan" }, 0, 409);
  const snapshot = await call("GET", "/schema", undefined, 1);
  const schema = snapshot.collections.find(
    (collection: { name: string }) => collection.name === name,
  );
  assert.equal(schema.actions.create, false);
  assert.ok(
    schema.fields.some((field: { name: string }) => field.name === "bio"),
  );
  assert.ok(
    !schema.fields.some(
      (field: { name: string }) => field.name === "private_note",
    ),
  );
  await call("DELETE", `/collections/${name}`, undefined, 0, 409);
  await call("PUT", "/users/profile-extension", { collection: null });
  assert.equal(await call("GET", "/users/me/extension", undefined, 1), null);
  assert.equal((await db(name).count("* as count").first()).count, "2");
  await call("PUT", "/users/profile-extension", { collection: name });
  assert.equal(
    (await call("GET", "/users/me/extension", undefined, 1)).data.id,
    users[1].id,
  );
});
