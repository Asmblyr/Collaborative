import { systemCollectionFixture as fixture } from "./support/system-collections.js";
import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { HTTPMethods } from "fastify";
import { issueUserTokens } from "../src/auth/tokens.js";
import { actualFileReferences } from "../src/files/references.js";

test("system catalog is opt-in and builtin structure remains protected on every entry point", async (t) => {
  const { db, call, fieldPath, create } = await fixture(t);
  const catalog = await call("GET", "/system-collections");
  assert.deepEqual(
    catalog.map((entry: { name: string }) => entry.name),
    ["users", "files", "policies", "workspaces", "service_accounts"],
  );
  assert.ok(
    catalog[0].fields.find(
      (field: { name: string; managed: boolean }) =>
        field.name === "email" && field.managed,
    ),
  );
  const ordinary = await call("GET", "/collections");
  assert.equal(
    ordinary.some((entry: { name: string }) =>
      entry.name.startsWith("asmblyr_"),
    ),
    false,
  );
  const before = await db("public.asmblyr_columns")
    .where({ table_name: "asmblyr_users" })
    .orderBy("ordinal_position");
  for (const field of [
    "id",
    "email",
    "superuser",
    "status",
    "created_at",
    "avatar_id",
  ]) {
    await call(
      "POST",
      `${fieldPath("users", field)}/configuration`,
      { field: { name: field, type: "text" } },
      403,
    );
    await call(
      "PUT",
      `${fieldPath("users", field)}/configuration`,
      { field: { nullable: true } },
      403,
    );
    await call("DELETE", fieldPath("users", field), undefined, 403);
  }
  for (const name of [
    "auth_sessions",
    "asmblyr_users",
    "ASMBLYR_USERS",
    "plugin_fake_records",
    "unknown",
  ]) {
    await call(
      "POST",
      `${fieldPath(name, "extra")}/configuration`,
      { field: { name: "extra", type: "text" } },
      404,
    );
  }
  const after = await db("public.asmblyr_columns")
    .where({ table_name: "asmblyr_users" })
    .orderBy("ordinal_position");
  assert.deepEqual(after, before);
  await create("users", "system_test_note");
  const bypasses: [HTTPMethods, string, object | undefined][] = [
    [
      "POST",
      "/collections/asmblyr_users/fields",
      { name: "bypass", type: "text" },
    ],
    [
      "PUT",
      "/collections/asmblyr_users/fields/system_test_note/configuration",
      { field: { nullable: false } },
    ],
    ["PATCH", "/collections/asmblyr_users/fields/email", { nullable: true }],
    ["DELETE", "/collections/asmblyr_users/fields/email", undefined],
    ["DELETE", "/collections/asmblyr_users", undefined],
  ];
  for (const [method, url, payload] of bypasses) {
    await call(method, url, payload, 403);
  }
  await call("DELETE", fieldPath("users", "system_test_note"), undefined, 204);
});

test("system custom-field access requires a human superuser including direct record writes", async (t) => {
  const { call, member, fieldPath } = await fixture(t);
  const operations: [HTTPMethods, string, object | undefined][] = [
    ["GET", "/system-collections", undefined],
    ["GET", "/system-collections/users/records", undefined],
    ["GET", `/system-collections/users/records/${member.id}`, undefined],
    [
      "PATCH",
      `/system-collections/users/records/${member.id}`,
      { values: { superuser: true } },
    ],
    [
      "POST",
      `${fieldPath("users", "injected")}/configuration`,
      { field: { name: "injected", type: "text" } },
    ],
    [
      "PUT",
      `${fieldPath("users", "email")}/configuration`,
      { field: { nullable: true } },
    ],
    ["DELETE", fieldPath("users", "email"), undefined],
  ];
  for (const [method, url, payload] of operations) {
    await call(method, url, payload, 403, 1);
    await call(method, url, payload, 401, -1);
  }
});

test("custom columns support defaults, presentation and validated values without altering builtin records", async (t) => {
  const { db, call, member, create, fieldPath } = await fixture(t);
  const fields = [
    ["system_test_text", "text", "a'b"],
    ["system_test_date", "date", "2026-10-06"],
    ["system_test_bigint", "bigint", "9223372036854775807"],
    ["system_test_decimal", "decimal", "10.25"],
    ["system_test_flag", "boolean", false],
    ["system_test_count", "integer", 12],
  ] as const;
  for (const [name, type, defaultValue] of fields) {
    await create("users", name, type, { defaultValue });
  }
  await create(
    "users",
    "system_test_tags",
    "json",
    {},
    { interface: "tags", label: "Метки" },
  );
  await create(
    "users",
    "system_test_choice",
    "text",
    {},
    { interface: "select", options: [{ label: "Да", value: "yes" }] },
  );
  const endpoint = `/system-collections/users/records/${member.id}`;
  const before = await call("GET", `/users/${member.id}/profile`);
  const record = await call("GET", endpoint);
  assert.equal(record.values.system_test_date, "2026-10-06");
  assert.equal(record.values.system_test_bigint, "9223372036854775807");
  assert.equal(record.values.system_test_text, "a'b");
  assert.equal(record.values.email, undefined);
  assert.equal(record.values.superuser, undefined);
  await call("PATCH", endpoint, {
    values: { system_test_tags: ["new", "tag"], system_test_choice: "yes" },
  });
  await call("PATCH", endpoint, { values: { system_test_choice: "no" } }, 400);
  await call(
    "PATCH",
    endpoint,
    { values: { system_test_date: "2026-02-30" } },
    400,
  );
  await call(
    "PATCH",
    endpoint,
    { values: { system_test_text: "rollback", superuser: true } },
    400,
  );
  assert.equal((await call("GET", endpoint)).values.system_test_text, "a'b");
  assert.equal(
    (await call("GET", `/users/${member.id}/profile`)).superuser,
    before.superuser,
  );
  assert.equal(
    (await call("GET", "/users/me", undefined, 200, 1)).system_test_text,
    undefined,
  );
  const [native] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test` })
    .returning("id");
  assert.equal(
    (await call("GET", `/system-collections/users/records/${native.id}`)).values
      .system_test_text,
    "a'b",
  );
  await call("PUT", `${fieldPath("users", "system_test_text")}/configuration`, {
    field: { defaultValue: "updated" },
    presentation: { label: "Note" },
  });
  assert.equal((await call("GET", endpoint)).values.system_test_text, "a'b");
  await call("PUT", `${fieldPath("users", "system_test_text")}/configuration`, {
    field: { defaultValue: null },
  });
  for (const extra of [{ required: true }, { nullable: false }]) {
    await call(
      "POST",
      `${fieldPath("users", "invalid")}/configuration`,
      { field: { name: "invalid", type: "text", ...extra } },
      400,
    );
    await call(
      "PUT",
      `${fieldPath("users", "system_test_text")}/configuration`,
      { field: extra },
      400,
    );
  }
  assert.equal(await db.schema.hasColumn("asmblyr_users", "invalid"), false);
  for (const payload of [
    { field: { name: "unsupported", type: "text" }, presentation: null },
    { field: { name: "unsupported", type: "text", searchable: true } },
  ]) {
    await call(
      "POST",
      `${fieldPath("users", "unsupported")}/configuration`,
      payload,
      400,
    );
  }
  await call(
    "PUT",
    `${fieldPath("users", "system_test_text")}/configuration`,
    { presentation: { rules: { readonly: true } } },
    400,
  );
  const listed = await call(
    "GET",
    `/system-collections/users/records?q=${encodeURIComponent(before.email)}`,
  );
  assert.equal(listed.records.length, 1);
  assert.deepEqual(Object.keys(listed.records[0]).sort(), [
    "id",
    "label",
    "values",
  ]);
  await call("GET", "/system-collections/users/records?page=0", undefined, 400);
  await call("GET", `/items/asmblyr_users/${member.id}`, undefined, 404);
  for (const name of [
    ...fields.map(([name]) => name),
    "system_test_tags",
    "system_test_choice",
  ]) {
    await call("DELETE", fieldPath("users", name), undefined, 204);
  }
});

test("custom field ownership is atomic; dependent views block deletion and all supported entities work", async (t) => {
  const { db, app, call, create, fieldPath, admin } = await fixture(t);
  const { accessToken } = await issueUserTokens(db, admin.id);
  const attempts = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: "POST",
        url: `${fieldPath("users", "system_race")}/configuration`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { field: { name: "system_race", type: "text" } },
      }),
    ),
  );
  assert.deepEqual(
    attempts.map((result) => result.statusCode).sort(),
    [201, 409],
  );
  await db.raw(
    "CREATE VIEW public.system_field_dependency AS SELECT system_race FROM public.asmblyr_users",
  );
  await call("DELETE", fieldPath("users", "system_race"), undefined, 409);
  assert.ok(
    await db("asmblyr_system_fields")
      .where({ collection_name: "users", field_name: "system_race" })
      .first(),
  );
  await db.raw("DROP VIEW public.system_field_dependency");
  await call("DELETE", fieldPath("users", "system_race"), undefined, 204);
  for (const name of ["files", "policies", "workspaces", "service_accounts"]) {
    const result = await create(name, "system_test_note");
    assert.ok(
      result.fields.find(
        (field: { name: string; managed: boolean }) =>
          field.name === "system_test_note" && !field.managed,
      ),
    );
    await call("GET", `/system-collections/${name}/records`);
    await call("DELETE", fieldPath(name, "system_test_note"), undefined, 204);
  }
});

test("custom file references validate readiness and prevent deleting attached files", async (t) => {
  const { db, call, create, fieldPath, member, admin } = await fixture(t);
  const ready = randomUUID();
  const failed = randomUUID();
  await db("asmblyr_files").insert(
    [ready, failed].map((id) => ({
      id,
      storage: "test",
      object_key: id,
      filename: "test.png",
      title: "Test",
      mime_type: "image/png",
      size: 1,
      sha256: "0".repeat(64),
      uploaded_by: admin.id,
      status: id === ready ? "ready" : "failed",
    })),
  );
  await create("users", "system_test_image", "file");
  await create("users", "system_test_gallery", "files");
  const endpoint = `/system-collections/users/records/${member.id}`;
  await call("PATCH", endpoint, { values: { system_test_image: failed } }, 409);
  await call("PATCH", endpoint, {
    values: { system_test_image: ready, system_test_gallery: [ready] },
  });
  assert.equal(
    (await actualFileReferences(db, ready)).filter(
      (entry) => entry.collection === "system:users",
    ).length,
    2,
  );
  await call("PATCH", endpoint, {
    values: { system_test_image: null, system_test_gallery: [] },
  });
  assert.deepEqual(await actualFileReferences(db, ready), []);
  for (const field of ["system_test_image", "system_test_gallery"]) {
    await call("DELETE", fieldPath("users", field), undefined, 204);
  }
});
