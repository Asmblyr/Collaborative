import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { materializedFixture } from "./support/materialized-fixture.js";

test("materialized discovery rejects incompatible sources and imports atomically", async (t) => {
  const { db, call, view, name } = await materializedFixture(t);
  await view(`${name}_nokey`, undefined, "");
  await view(`${name}_composite`, "SELECT 1 AS id, 2 AS other", "id, other");
  await view(`${name}_badtype`, "SELECT 1 AS id, ARRAY[1,2] AS numbers");
  await view(`${name}_null`, "SELECT NULL::integer AS id, 'Null' AS title");
  await view(`${name}_negative`, "SELECT -1 AS id, 'Negative' AS title");
  await view(`${name}_empty`, "SELECT ''::text AS id, 'Empty' AS title");
  await view(`${name}_unpopulated`, undefined, "id", false);
  await view(`plugin_${name}`);
  await view(`${name}_partial`, undefined, "id) WHERE id > 0 --");
  await view(
    `${name}_uuid`,
    "SELECT '00000000-0000-0000-0000-000000000001'::uuid AS id, 'UUID'::text AS title",
  );
  await view(
    `${name}_text`,
    "SELECT 'row-key'::varchar(80) AS id, 'Text'::text AS title",
  );
  await view(name);
  const candidates = (await call("GET", "/materialized-views")).data;
  const problem = (suffix: string) =>
    candidates.find((c: { name: string }) => c.name === `${name}_${suffix}`)
      .problem;
  assert.equal(problem("nokey"), "missing-key");
  assert.equal(problem("composite"), "missing-key");
  assert.equal(problem("badtype"), "unsupported-fields");
  assert.equal(problem("unpopulated"), "not-populated");
  assert.equal(problem("partial"), "missing-key");
  assert.ok(
    !candidates.some((c: { name: string }) => c.name === `plugin_${name}`),
  );
  await call(
    "POST",
    "/materialized-views",
    { name: `plugin_${name}`, primaryKey: "id" },
    403,
  );
  for (const suffix of [
    "nokey",
    "composite",
    "badtype",
    "unpopulated",
    "partial",
    "null",
    "negative",
    "empty",
  ]) {
    await call(
      "POST",
      "/materialized-views",
      { name: `${name}_${suffix}`, primaryKey: "id" },
      400,
    );
    assert.equal(
      await db("asmblyr_collections")
        .where({ name: `${name}_${suffix}` })
        .first(),
      undefined,
    );
  }
  await call(
    "POST",
    "/materialized-views",
    {
      name,
      primaryKey: "id",
      presentations: {
        title: { label: "Valid" },
        missing: { label: "Invalid" },
      },
    },
    400,
  );
  assert.equal(
    await db("asmblyr_collections").where({ name }).first(),
    undefined,
  );
  assert.equal(
    await db("asmblyr_field_metadata").where({ collection_name: name }).first(),
    undefined,
  );
  for (const [suffix, id] of [
    ["uuid", "00000000-0000-0000-0000-000000000001"],
    ["text", "row-key"],
  ]) {
    await call(
      "POST",
      "/materialized-views",
      { name: `${name}_${suffix}`, primaryKey: "id" },
      201,
    );
    await call("GET", `/items/${name}_${suffix}/${id}`);
  }
});

test("external refresh works; missing population or changed source fails clearly without adopting new columns", async (t) => {
  const { db, call, view, name } = await materializedFixture(t);
  await view();
  await call("POST", "/materialized-views", { name, primaryKey: "id" }, 201);
  await db.raw("REFRESH MATERIALIZED VIEW ??", [`public.${name}`]);
  await call("GET", `/items/${name}`);
  await db.raw("REFRESH MATERIALIZED VIEW ?? WITH NO DATA", [`public.${name}`]);
  const empty = await call("GET", `/items/${name}`, undefined, 503);
  assert.equal(empty.code, "MATERIALIZED_VIEW_NOT_POPULATED");
  await call("GET", "/schema");
  await db.raw("REFRESH MATERIALIZED VIEW ??", [`public.${name}`]);
  await db.raw("DROP INDEX ??", [`${name}_key`]);
  const noIndex = await call("GET", `/items/${name}`, undefined, 409);
  assert.equal(noIndex.code, "MATERIALIZED_VIEW_CHANGED");
  await db.raw("CREATE UNIQUE INDEX ?? ON ?? (id)", [
    `${name}_key`,
    `public.${name}`,
  ]);
  await call("GET", `/items/${name}`);
  await db.raw("ALTER MATERIALIZED VIEW ?? RENAME COLUMN title TO changed", [
    `public.${name}`,
  ]);
  await call("GET", `/items/${name}`, undefined, 409);
  await call("GET", "/schema", undefined, 409);
  await call(
    "DELETE",
    `/collections/${name}/materialized-view`,
    undefined,
    204,
  );
  await call("POST", "/materialized-views", { name, primaryKey: "id" }, 201);
  assert.equal((await call("GET", `/items/${name}/1`)).data.changed, "First");
  await db.raw("DROP MATERIALIZED VIEW ??", [`public.${name}`]);
  await call("GET", `/items/${name}`, undefined, 409);
  await call(
    "DELETE",
    `/collections/${name}/materialized-view`,
    undefined,
    204,
  );
});

test("additive migration rollback preserves ordinary tables and refuses active materialized collections", async (t) => {
  const { db, call, view, name, table } = await materializedFixture(t);
  const require = createRequire(import.meta.url);
  const migration = require("../migrations/20261004140000_materialized_collections.cjs");
  await call(
    "POST",
    "/collections",
    { name: table, fields: [{ name: "title", type: "text" }] },
    201,
  );
  const item = (
    await call("POST", `/items/${table}`, { title: "Keep me" }, 201)
  ).data;
  await view();
  await call("POST", "/materialized-views", { name, primaryKey: "id" }, 201);
  await assert.rejects(
    db.transaction((trx) => migration.down(trx)),
    /Disconnect materialized collections/,
  );
  await call(
    "DELETE",
    `/collections/${name}/materialized-view`,
    undefined,
    204,
  );
  await db.transaction((trx) => migration.down(trx));
  assert.equal(
    (await db(table).where({ id: item.id }).first()).title,
    "Keep me",
  );
  assert.equal((await db(name).count("*").first())!.count, "2");
  await db.transaction((trx) => migration.up(trx));
  assert.equal(
    (await call("GET", `/items/${table}/${item.id}`)).data.title,
    "Keep me",
  );
});
