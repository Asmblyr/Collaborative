import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("field configuration validates the final state and rolls back DDL and metadata together", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = "test_atomic_field";
  const configure = (
    field: string,
    payload: object,
    method: "POST" | "PUT" = "PUT",
  ) =>
    app.inject({
      method,
      url: `/collections/${name}/fields/${field}/configuration`,
      payload,
    });
  const presentation = (value: string) => ({
    interface: "select",
    options: [{ value, label: value }],
  });
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/collections",
          payload: { name },
        })
      ).statusCode,
      201,
    );
    const created = await configure(
      "status",
      {
        field: { name: "status", type: "text", defaultValue: "a" },
        presentation: presentation("a"),
        searchable: false,
      },
      "POST",
    );
    assert.equal(created.statusCode, 201, created.body);

    const changed = await configure("status", {
      field: { defaultValue: "b", required: true },
      presentation: presentation("b"),
      searchable: true,
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const [item] = await database(name).insert({}).returning("*");
    assert.equal(item.status, "b", "SQL default changed with presentation");

    const rejected = await configure("status", {
      field: { defaultValue: "c", required: false },
      presentation: presentation("c"),
      relationSearchable: true,
    });
    assert.equal(rejected.statusCode, 404, rejected.body);
    const metadata = await database("asmblyr_field_metadata")
      .where({ collection_name: name, field_name: "status" })
      .first();
    assert.equal(metadata.default_value, "b");
    assert.equal(metadata.required, true);
    assert.equal(metadata.presentation.options[0].value, "b");
    assert.equal(
      (await database(name).insert({}).returning("status"))[0].status,
      "b",
    );

    const invalidCreate = await configure(
      "bad",
      {
        field: { name: "bad", type: "text", defaultValue: "unknown" },
        presentation: presentation("a"),
      },
      "POST",
    );
    assert.equal(invalidCreate.statusCode, 400, invalidCreate.body);
    assert.equal(await database.schema.hasColumn(name, "bad"), false);
    assert.equal((await configure("id", { searchable: true })).statusCode, 400);
  } finally {
    await app.inject({ method: "DELETE", url: `/collections/${name}` });
    await app.close();
    await database.destroy();
  }
});

for (const keyType of ["bigserial", "text"] as const) {
  test(`relation defaults retain the ${keyType} key contract when required changes`, async () => {
    const database = knex({
      client: "pg",
      connection: process.env.DATABASE_URL,
    });
    const app = createApp({
      databaseUrl: process.env.DATABASE_URL,
      logger: false,
    });
    await authorizeTestApp(app, database);
    const source = `test_fk_source_${keyType}`;
    const target = `test_fk_target_${keyType}`;
    try {
      for (const name of [source, target]) {
        const response = await app.inject({
          method: "POST",
          url: "/collections",
          payload: {
            name,
            primaryKey: { name: "id", type: keyType },
          },
        });
        assert.equal(response.statusCode, 201, response.body);
      }
      const id = keyType === "bigserial" ? "9007199254740993" : "manual-parent";
      await database(target).insert({ id });
      const relation = await app.inject({
        method: "POST",
        url: `/collections/${source}/relations`,
        payload: {
          name: "parent",
          targetCollection: target,
          onDelete: "setDefault",
          defaultValue: id,
        },
      });
      assert.equal(relation.statusCode, 201, relation.body);
      const updated = await app.inject({
        method: "PATCH",
        url: `/collections/${source}/fields/parent`,
        payload: { required: true },
      });
      assert.equal(updated.statusCode, 200, updated.body);
      const record = await app.inject({
        method: "POST",
        url: `/items/${source}`,
        payload: keyType === "text" ? { id: "child" } : {},
      });
      assert.equal(record.statusCode, 201, record.body);
      assert.equal(record.json().data.parent, id);
    } finally {
      await app.inject({ method: "DELETE", url: `/collections/${source}` });
      await app.inject({ method: "DELETE", url: `/collections/${target}` });
      await app.close();
      await database.destroy();
    }
  });
}
