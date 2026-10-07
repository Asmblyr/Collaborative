import { systemCollectionFixture as fixture } from "./support/system-collections.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

test("system M2O fields use real nullable foreign keys for every supported target key", async (t) => {
  const { db, call, fieldPath, member } = await fixture(t);
  for (const type of ["serial", "bigserial", "uuid", "text"] as const) {
    const target = `departments_${type}`;
    const name = `department_${type}`;
    const path = `${fieldPath("users", name)}/configuration`;
    const endpoint = `/system-collections/users/records/${member.id}`;
    await call(
      "POST",
      "/collections",
      {
        name: target,
        primaryKey: { name: "code", type },
        fields: [{ name: "title", type: "text" }],
      },
      201,
    );
    if (type === "bigserial") {
      await db.raw(
        "SELECT setval(pg_get_serial_sequence(?, 'code'), 9007199254740992, true)",
        [`public.${target}`],
      );
    }
    const item = await call(
      "POST",
      `/items/${target}`,
      {
        title: "Engineering",
        ...(type === "text" ? { code: "engineering" } : {}),
      },
      201,
    );
    const catalog = await call(
      "POST",
      path,
      {
        field: { name, type: "relation", targetCollection: target },
        presentation: { label: "Департамент", width: "half" },
      },
      201,
    );
    const relation = catalog.fields.find(
      (field: { name: string }) => field.name === name,
    );
    assert.equal(relation.type, "relation");
    assert.equal(relation.managed, false);
    assert.equal(relation.nullable, true);
    assert.deepEqual(relation.relation, {
      kind: "m2o",
      collection: target,
      primaryKey: { name: "code", type },
      onDelete: "setNull",
    });
    assert.equal((await call("GET", endpoint)).values[name], null);
    await call("PATCH", endpoint, { values: { [name]: item.code } });
    assert.equal(
      String((await call("GET", endpoint)).values[name]),
      String(item.code),
    );
    if (type === "bigserial") {
      assert.equal(item.code, "9007199254740993");
    }
    const missing =
      type === "uuid"
        ? randomUUID()
        : type === "text"
          ? "absent"
          : "2147483647";
    await call("PATCH", endpoint, { values: { [name]: missing } }, 409);
    await call("PATCH", endpoint, { values: { [name]: {} } }, 400);
    assert.equal(
      String((await call("GET", endpoint)).values[name]),
      String(item.code),
    );
    const changed = await call("PUT", path, {
      field: { required: false, nullable: true },
      presentation: { label: "Department" },
    });
    assert.deepEqual(
      changed.fields.find((field: { name: string }) => field.name === name)
        .relation,
      relation.relation,
    );
    await call("PUT", path, { field: { defaultValue: item.code } }, 400);
    await call("PUT", path, { field: { targetCollection: target } }, 400);
    await call("DELETE", `/collections/${target}`, undefined, 409);
    assert.ok(await db.schema.hasTable(target));
    const [native] = await db("asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test` })
      .returning(["id", name]);
    assert.equal(native[name], null);
    await call("PATCH", endpoint, { values: { [name]: null } });
    await call("PATCH", endpoint, { values: { [name]: String(item.code) } });
    await call("DELETE", `/items/${target}/${item.code}`, undefined, 204);
    assert.equal((await call("GET", endpoint)).values[name], null);
    assert.ok(await db("asmblyr_users").where({ id: member.id }).first("id"));
    await call("DELETE", fieldPath("users", name), undefined, 204);
    await call("DELETE", `/collections/${target}`, undefined, 204);
  }
});

test("system relations reject protected targets, unsafe configuration and unauthorized writes atomically", async (t) => {
  const { db, call, fieldPath, member } = await fixture(t);
  const target = "system_relation_target";
  await call("POST", "/collections", { name: target, fields: [] }, 201);
  const field = {
    name: "department",
    type: "relation",
    targetCollection: target,
  };
  const path = `${fieldPath("users", field.name)}/configuration`;
  await call(
    "POST",
    "/collections",
    { name: "system_single_target", mode: "single", fields: [] },
    201,
  );
  await call(
    "POST",
    path,
    { field: { ...field, targetCollection: "system_single_target" } },
    400,
  );
  await call("DELETE", "/collections/system_single_target", undefined, 204);
  await db.raw(
    "CREATE MATERIALIZED VIEW public.system_view_target AS SELECT 1::integer AS id",
  );
  await db.raw(
    "CREATE UNIQUE INDEX system_view_target_id ON public.system_view_target (id)",
  );
  await call(
    "POST",
    "/materialized-views",
    { name: "system_view_target", primaryKey: "id" },
    201,
  );
  await call(
    "POST",
    path,
    { field: { ...field, targetCollection: "system_view_target" } },
    403,
  );
  for (const overrides of [
    { required: true },
    { nullable: false },
    { onDelete: "cascade" },
    { defaultValue: randomUUID() },
    { reverseField: "users" },
    { kind: "m2m" },
    { primaryKey: { name: "id", type: "text" } },
  ]) {
    await call("POST", path, { field: { ...field, ...overrides } }, 400);
  }
  for (const targetCollection of [
    "asmblyr_users",
    "ASMBLYR_USERS",
    "plugin_fake_records",
  ]) {
    await call("POST", path, { field: { ...field, targetCollection } }, 403);
  }
  await call(
    "POST",
    path,
    { field: { ...field, targetCollection: "unregistered" } },
    404,
  );
  await call("POST", path, { field }, 403, 1);
  await call("POST", path, { field }, 401, -1);
  assert.equal(await db.schema.hasColumn("asmblyr_users", field.name), false);
  assert.equal(
    await db("asmblyr_system_fields")
      .where({ collection_name: "users", field_name: field.name })
      .first(),
    undefined,
  );
  await call(
    "POST",
    `${fieldPath("users", "email")}/configuration`,
    { field: { ...field, name: "email" } },
    403,
  );
  await call("POST", path, { field }, 201);
  await call(
    "PATCH",
    `/system-collections/users/records/${member.id}`,
    { values: { department: null } },
    403,
    1,
  );
  await call("PUT", path, { field: { nullable: false } }, 400);
  await call("DELETE", fieldPath("users", "department"), undefined, 204);
  await call("DELETE", `/collections/${target}`, undefined, 204);
});
