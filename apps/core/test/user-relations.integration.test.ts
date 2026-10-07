import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { systemCollectionFixture as fixture } from "./support/system-collections.js";
import { listUserReferences } from "../src/auth/user-references.js";

test("user references create native FKs and validate record and draft writes", async (t) => {
  const { db, call, member } = await fixture(t);
  const name = `user_ref_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await call(
    "POST",
    "/collections",
    { name, fields: [{ name: "name", type: "text" }] },
    201,
  );
  const target = await db("asmblyr_users")
    .insert({
      email: `${randomUUID()}@example.test`,
      display_name: "Department manager",
    })
    .returning("id");
  const userId = target[0].id;
  const relation = await call(
    "POST",
    `/collections/${name}/relations`,
    { name: "manager_id", targetCollection: "@users", onDelete: "setNull" },
    201,
  );
  assert.deepEqual(
    relation.fields.find((f: { name: string }) => f.name === "manager_id")
      .relation,
    {
      kind: "m2o",
      collection: "@users",
      primaryKey: { name: "id", type: "uuid" },
      onDelete: "setNull",
    },
  );
  assert.equal(
    await db("asmblyr_collections").where({ name: "asmblyr_users" }).first(),
    undefined,
  );
  const [label] = await call("GET", `/users/references?ids=${userId}`);
  assert.deepEqual(Object.keys(label).sort(), ["id", "label"]);
  assert.ok(label.label.startsWith("Department manager · "));
  const item = await call(
    "POST",
    `/items/${name}`,
    { name: "Engineering", manager_id: userId },
    201,
  );
  assert.equal(item.manager_id, userId);
  const filter = encodeURIComponent(
    JSON.stringify({
      logic: "and",
      children: [{ field: "manager_id", op: "eq", value: userId }],
    }),
  );
  const matching = await call("GET", `/items/${name}?filter=${filter}`);
  assert.deepEqual(
    matching.map((row: { id: number }) => row.id),
    [item.id],
  );
  const nestedFilter = encodeURIComponent(
    JSON.stringify({
      logic: "and",
      children: [{ field: "manager_id.email", op: "contains", value: "@" }],
    }),
  );
  await call("GET", `/items/${name}?filter=${nestedFilter}`, undefined, 400);
  await call(
    "PATCH",
    `/items/${name}/${item.id}`,
    { manager_id: randomUUID() },
    409,
  );
  await call(
    "PATCH",
    `/items/${name}/${item.id}`,
    { manager_id: "invalid" },
    400,
  );
  await call(
    "POST",
    `/items/${name}/commit`,
    { values: { manager_id: userId } },
    200,
  );
  await call(
    "POST",
    `/items/${name}/commit`,
    {
      values: {},
      references: {
        manager_id: { values: { email: "injection@example.test" } },
      },
    },
    400,
  );
  await call(
    "PATCH",
    `/collections/${name}/fields/manager_id`,
    { defaultValue: userId },
    400,
  );
  await call("PUT", `/collections/${name}/fields/manager_id/presentation`, {
    label: "Руководитель",
    width: "half",
  });
  await db("asmblyr_users")
    .where({ id: userId })
    .update({ status: "disabled" });
  await call("POST", `/items/${name}`, { manager_id: userId }, 409);
  assert.equal(
    (await call("GET", `/users/references?ids=${userId}`))[0].id,
    userId,
  );
  assert.deepEqual(
    await call("GET", "/users/references?q=Department%20manager"),
    [],
  );
  await call("PATCH", `/items/${name}/${item.id}`, {
    name: "New name",
    manager_id: userId,
  });
  await db("asmblyr_users").where({ id: userId }).delete();
  assert.equal(
    (await call("GET", `/items/${name}/${item.id}`)).manager_id,
    null,
  );
  await call(
    "DELETE",
    `/collections/${name}/fields/manager_id`,
    undefined,
    204,
  );
  assert.equal(
    await db("asmblyr_relations").where({ source_collection: name }).first(),
    undefined,
  );
  await call(
    "POST",
    `/collections/${name}/relations`,
    { name: "manager_id", targetCollection: "@users" },
    201,
  );
  const restricted = await call(
    "POST",
    `/items/${name}`,
    { manager_id: member.id },
    201,
  );
  await assert.rejects(
    db("asmblyr_users").where({ id: member.id }).delete(),
    (error: { code?: string }) => error.code === "23503",
  );
  await call("DELETE", `/items/${name}/${restricted.id}`, undefined, 204);
  await call("DELETE", `/collections/${name}`, undefined, 204);
});

test("user reference permissions are enforced for selection, writes, service accounts and revocation", async (t) => {
  const { db, call, member } = await fixture(t);
  const name = `user_perm_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await call("POST", "/collections", { name, fields: [] }, 201);
  await call(
    "POST",
    `/collections/${name}/relations`,
    { name: "manager_id", targetCollection: "@users", onDelete: "setNull" },
    201,
  );
  const permissions = ["create", "read", "update"].map((action) => ({
    collection: name,
    action,
    fields: ["*"],
  }));
  const policy = await call(
    "POST",
    "/policies",
    { name: randomUUID(), permissions, userIds: [member.id] },
    201,
  );
  await call("GET", "/users/references", undefined, 401, -1);
  await call("GET", "/users/references", undefined, 403, 1);
  await assert.rejects(
    listUserReferences(
      db,
      {
        kind: "service",
        id: randomUUID(),
        keyId: null,
        federationId: null,
        superuser: false,
      },
      {},
    ),
    { statusCode: 403 },
  );
  await call("POST", `/items/${name}`, { manager_id: member.id }, 403, 1);
  const item = await call(
    "POST",
    `/items/${name}`,
    { manager_id: member.id },
    201,
  );
  // Retaining an existing reference does not require directory access.
  await call(
    "PATCH",
    `/items/${name}/${item.id}`,
    { manager_id: member.id },
    200,
    1,
  );
  await call(
    "PATCH",
    `/items/${name}/${item.id}`,
    { manager_id: null },
    200,
    1,
  );
  await call("PATCH", `/policies/${policy.id}`, {
    name: policy.name,
    permissions: [
      ...permissions,
      { section: "users", action: "read", fields: ["*"] },
    ],
    userIds: [member.id],
  });
  await call("POST", `/items/${name}`, { manager_id: member.id }, 201, 1);
  assert.ok(
    (await call("GET", `/users/references?ids=${member.id}`, undefined, 200, 1))
      .length,
  );
  await call("GET", "/users/references?limit=1000", undefined, 400);
  await call("GET", "/users/references?ids=bad", undefined, 400);
  await call("GET", "/users/references?fields=password_hash", undefined, 400);
  await call("GET", "/items/asmblyr_users", undefined, 404);
  await call("GET", "/items/%40users", undefined, 400);
  await call("DELETE", `/policies/${policy.id}`, undefined, 204);
  await call("GET", "/users/references", undefined, 403, 1);
  await call("DELETE", `/collections/${name}`, undefined, 204);
});

test("system relation configuration and migration cannot silently discard references", async (t) => {
  const { db, call } = await fixture(t);
  const name = `user_ddl_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await call("POST", "/collections", { name, fields: [] }, 201);
  for (const extra of [
    { kind: "o2m" },
    { kind: "m2m" },
    { reverseField: "departments" },
    { onDelete: "cascade" },
    { onDelete: "setDefault", defaultValue: randomUUID() },
    { targetCollection: "asmblyr_users" },
    { targetCollection: "@policies" },
  ]) {
    await call(
      "POST",
      `/collections/${name}/relations`,
      { name: "manager_id", targetCollection: "@users", ...extra },
      extra.targetCollection === "asmblyr_users" ? 403 : 400,
    );
  }
  assert.equal(await db.schema.hasColumn(name, "manager_id"), false);
  const migration = createRequire(import.meta.url)(
    "../migrations/20261007040000_system_user_relations.cjs",
  );
  await db.transaction(async (trx) => {
    await migration.down(trx);
    await migration.up(trx);
  });
  await call(
    "POST",
    `/collections/${name}/relations`,
    { name: "manager_id", targetCollection: "@users" },
    201,
  );
  await assert.rejects(
    db.transaction((trx) => migration.down(trx)),
    /Remove system user relations/,
  );
  assert.equal(
    (await call("GET", "/collections")).find(
      (c: { name: string }) => c.name === name,
    ).fields[0].type,
    "relation",
  );
  await call("DELETE", `/collections/${name}`, undefined, 204);
});
