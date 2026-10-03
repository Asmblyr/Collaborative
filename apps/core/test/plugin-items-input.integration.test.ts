import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("kit validates runtime inputs and cannot accept identity or privilege overrides", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const { call, collection, memberToken, adminToken, admin } = fixture;
  for (const options of [
    null,
    [],
    "all",
    { actor: admin },
    { superuser: true },
    { access: { principal: admin } },
    { fields: "title" },
    { fields: ["title", 1] },
    { fields: ["*"] },
    { fields: ["title as secret"] },
    { fields: ["missing"] },
    { limit: 101 },
    { limit: 0 },
    { limit: "10" },
    { limit: 1.5 },
    { page: -1 },
    { page: 2_147_483_649, limit: 1 },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { sort: "title desc" },
    { direction: "sideways" },
    { q: 1 },
    { q: "x".repeat(101) },
    { filter: "{}" },
    { filter: [] },
    { filter: null },
    { filter: { field: "title", op: "eq", value: "Bravo" } },
    { filter: { logic: "and", children: [{ field: "title", op: "sql", value: "true" }] } },
    { filter: { logic: "and", children: [{ field: "title", op: "eq", value: 1 }] } },
    { filter: { logic: "and", children: [], extra: "x" } },
    { filter: { logic: "and", children: [], oversized: "x".repeat(8193) } },
  ]) {
    const error = await call("POST", "/reader/list", { collection, options }, 400, memberToken);
    assert.ok(error.requestId);
    assert.ok(error.message);
  }
  for (const options of [{ actor: admin }, { superuser: true }, { limit: 10 }, null]) {
    await call("POST", "/reader/get", { collection, id: 1, options }, 400, memberToken);
  }
  for (const name of [null, {}, "public.asmblyr_users", "wrong-name", "UPPER"]) {
    await call("POST", "/reader/list", { collection: name }, 400, memberToken);
  }
  for (const name of ["asmblyr_users", "asmblyr_auth_sessions", "test_missing_sdk"]) {
    await call("POST", "/reader/list", { collection: name }, 403, memberToken);
    await call("POST", "/reader/list", { collection: name }, 404, adminToken);
    await call("POST", "/reader/get", { collection: name, id: 1 }, 404, adminToken);
  }
  for (const id of [
    null,
    {},
    true,
    0,
    -1,
    1.5,
    "",
    "1 OR 1=1",
    2147483648,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await call("POST", "/reader/get", { collection, id }, 400, memberToken);
  }
});

test("kit preserves custom primary keys, bigint precision and system timestamps", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const { db, call, collection, grant, memberToken } = fixture;
  for (const [type, id] of [
    ["bigserial", "9223372036854775806"],
    ["uuid", randomUUID()],
    ["text", "shop / 20%"],
  ] as const) {
    const name = `${collection}_${type}`;
    await call(
      "POST",
      "/collections",
      {
        name,
        primaryKey: { name: "key", type },
        timestamps: { createdAt: true, updatedAt: true },
        fields: [{ name: "title", type: "text" }],
      },
      201,
    );
    // Direct insert supplies an exact bigint without converting it to a JS number.
    const createdAt = "2026-01-01T12:00:00.000Z";
    await db(name).insert({ key: id, title: "Example", created_at: createdAt });
    await grant(name, ["title", "created_at", "updated_at"]);
    const options = { fields: ["title", "created_at"] };
    const result = await call(
      "POST",
      "/reader/get",
      { collection: name, id, options },
      200,
      memberToken,
    );
    assert.deepEqual(result.data, { key: id, title: "Example", created_at: createdAt });
    assert.deepEqual(
      result,
      await call(
        "GET",
        `/items/${name}/${encodeURIComponent(id)}?fields=title,created_at`,
        undefined,
        200,
        memberToken,
      ),
    );
    const list = await call(
      "POST",
      "/reader/list",
      { collection: name, options: { fields: ["key"] } },
      200,
      memberToken,
    );
    assert.deepEqual(list.data, [{ key: id }]);
    await call(
      "POST",
      "/reader/get",
      { collection: name, id: "missing" },
      type === "text" ? 404 : 400,
      memberToken,
    );
  }
});
