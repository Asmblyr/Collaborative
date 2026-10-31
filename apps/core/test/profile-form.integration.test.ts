import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { systemCollectionFixture } from "./support/system-collections.js";

test("one user form enforces owner fields, protected columns and atomic updates", async (t) => {
  const { db, call, member, admin, create, fieldPath } =
    await systemCollectionFixture(t);
  const field = `profile_${randomUUID().replaceAll("-", "")}`;
  await create("users", field);
  const config = await call("GET", "/system-collections/users/form");
  assert.ok(
    config.fields.some((entry: { name: string }) => entry.name === field),
  );
  assert.ok(
    !config.fields.some(
      (entry: { name: string }) => entry.name === "superuser",
    ),
  );
  await call("GET", "/system-collections/users/form", undefined, 403, 1);
  await call(
    "PUT",
    "/system-collections/users/form",
    { layout: null, selfAccess: { [field]: "write" } },
    403,
    1,
  );
  await call(
    "PUT",
    "/system-collections/users/form",
    { layout: null, selfAccess: { superuser: "write" } },
    400,
  );
  const hidden = await call("GET", "/users/me/form", undefined, 200, 1);
  assert.ok(
    !hidden.fields.some((entry: { name: string }) => entry.name === field),
  );
  assert.equal(hidden.values[field], undefined);
  await call(
    "PATCH",
    "/users/me/form",
    { values: { [field]: "blocked" } },
    400,
    1,
  );
  const layout = {
    version: 1,
    tabs: [
      {
        id: "details",
        label: "Профиль",
        children: [
          { id: "first", kind: "field", field: "firstName", width: "half" },
          { id: "custom", kind: "field", field, width: "full" },
        ],
      },
    ],
  };
  await call("PUT", "/system-collections/users/form", {
    layout,
    selfAccess: { [field]: "read" },
  });
  const readOnly = await call("GET", "/users/me/form", undefined, 200, 1);
  assert.deepEqual(readOnly.layout, layout);
  assert.ok(readOnly.readOnlyFields.includes(field));
  await call(
    "PATCH",
    "/users/me/form",
    { values: { [field]: "blocked" } },
    403,
    1,
  );
  await call("PUT", "/system-collections/users/form", {
    layout,
    selfAccess: { [field]: "write", firstName: "write" },
  });
  const result = await call(
    "PATCH",
    "/users/me/form",
    { values: { firstName: "Иван", [field]: "Инженер" } },
    200,
    1,
  );
  assert.equal(result.values.firstName, "Иван");
  assert.equal(result.values[field], "Инженер");
  for (const key of [
    "superuser",
    "password_hash",
    "status",
    "email",
    "@display:fake",
  ]) {
    await call(
      "PATCH",
      "/users/me/form",
      { values: { [key]: true } },
      key === "email" ? 403 : 400,
      1,
    );
  }
  await call(
    "PATCH",
    "/users/me/form",
    { values: { firstName: "x".repeat(121), [field]: "must roll back" } },
    400,
    1,
  );
  const row = await db("public.asmblyr_users").where({ id: member.id }).first();
  assert.equal(row[field], "Инженер");
  assert.equal(row.first_name, "Иван");
  assert.equal(row.superuser, false);
  await call("GET", `/users/${admin.id}/form`, undefined, 403, 1);
  await call(
    "PATCH",
    `/users/${admin.id}/form`,
    { values: { firstName: "other" } },
    403,
    1,
  );
  await call("PUT", "/system-collections/users/form", {
    layout,
    selfAccess: {},
  });
  const revoked = await call("GET", "/users/me/form", undefined, 200, 1);
  assert.equal(revoked.values[field], undefined);
  assert.ok(!JSON.stringify(revoked.layout).includes(field));
  assert.equal(
    (await db("public.asmblyr_users").where({ id: member.id }).first())[field],
    "Инженер",
  );
  await call("PUT", "/system-collections/users/form", {
    layout: null,
    selfAccess: {},
  });
  await call("DELETE", fieldPath("users", field), undefined, 204);
});

test("virtual fields preserve existing sources and explicit self visibility without granting table access", async (t) => {
  const { db, call, member, create, fieldPath } =
    await systemCollectionFixture(t);
  const field = `source_${randomUUID().replaceAll("-", "")}`;
  await create("users", field);
  await db("public.asmblyr_users")
    .where({ id: member.id })
    .update({ [field]: "Источник" });
  const id = randomUUID();
  for (const selfVisible of [false, true]) {
    await call("PUT", "/users/profile-display", {
      title: "Старое название",
      entries: [{ id, label: "Метка", path: [field], selfVisible }],
    });
    const form = await call("GET", "/users/me/form", undefined, 200, 1);
    assert.equal(
      form.values[`@display:${id}`],
      selfVisible ? "Источник" : undefined,
    );
    assert.equal(form.values[field], undefined);
  }
  await call(
    "PATCH",
    "/users/me/form",
    { values: { [`@display:${id}`]: "injected" } },
    403,
    1,
  );
  assert.equal(
    (await db("public.asmblyr_users").where({ id: member.id }).first())[field],
    "Источник",
  );
  await call("PUT", "/users/profile-display", { title: "", entries: [] });
  await call("DELETE", fieldPath("users", field), undefined, 204);
});

test("owner relation writes require ordinary target access; dropping a field revokes its owner grant", async (t) => {
  const { call, create, fieldPath, member } = await systemCollectionFixture(t);
  const collection = `target_${randomUUID().replaceAll("-", "")}`;
  const field = `relation_${randomUUID().replaceAll("-", "")}`;
  await call(
    "POST",
    "/collections",
    { name: collection, fields: [{ name: "title", type: "text" }] },
    201,
  );
  const item = await call(
    "POST",
    `/items/${collection}`,
    { title: "Hidden" },
    201,
  );
  await create("users", field, "relation", { targetCollection: collection });
  await call("PUT", "/system-collections/users/form", {
    layout: null,
    selfAccess: { [field]: "write" },
  });
  await call(
    "PATCH",
    "/users/me/form",
    { values: { [field]: String(item.id) } },
    403,
    1,
  );
  await call("PATCH", "/users/me/form", {
    values: { [field]: String(item.id) },
  });
  const policy = await call(
    "POST",
    "/policies",
    { name: "Profile target reader" },
    201,
  );
  const permission = await call(
    "POST",
    "/permissions",
    { collection, action: "read", fields: ["*"] },
    201,
  );
  await call(
    "PUT",
    `/policies/${policy.id}/permissions/${permission.id}`,
    undefined,
    204,
  );
  await call(
    "PUT",
    `/policies/${policy.id}/users`,
    { userIds: [member.id] },
    204,
  );
  const assigned = await call(
    "PATCH",
    "/users/me/form",
    { values: { [field]: String(item.id) } },
    200,
    1,
  );
  assert.equal(String(assigned.values[field]), String(item.id));
  await call("DELETE", fieldPath("users", field), undefined, 204);
  await create("users", field, "relation", { targetCollection: collection });
  const config = await call("GET", "/system-collections/users/form");
  assert.equal(config.selfAccess[field], undefined);
  await call("DELETE", fieldPath("users", field), undefined, 204);
  await call("DELETE", `/collections/${collection}`, undefined, 204);
});
