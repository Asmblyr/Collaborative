import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("ordinary UUID fields preserve values without user/file relations", async () => {
  const f = await featureFixture();
  const name = `${f.prefix}_uuid`;
  f.names.push(name);
  const sourceId = randomUUID();
  try {
    await f.call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "source_user", type: "uuid", nullable: true },
          {
            name: "required_user",
            type: "uuid",
            nullable: true,
            required: true,
            defaultValue: sourceId.toUpperCase(),
          },
        ],
      },
      201,
    );
    const item = await f.call(
      "POST",
      `/items/${name}`,
      { source_user: sourceId.toUpperCase() },
      201,
    );
    assert.equal(item.source_user, sourceId);
    assert.equal(item.required_user, sourceId);
    const columns = await f
      .db("information_schema.columns")
      .where({ table_schema: "public", table_name: name })
      .whereIn("column_name", ["source_user", "required_user"])
      .select("data_type");
    assert.deepEqual(
      columns.map((c) => c.data_type),
      ["uuid", "uuid"],
    );
    const catalog = await f.call("GET", "/collections");
    const field = catalog
      .find((c: { name: string }) => c.name === name)
      .fields.find((c: { name: string }) => c.name === "source_user");
    assert.equal(field.type, "uuid");
    assert.equal(field.relation, undefined);
    for (const invalid of ["not-a-uuid", "", 123, {}, [sourceId]]) {
      await f.call(
        "PATCH",
        `/items/${name}/${item.id}`,
        { source_user: invalid },
        400,
      );
    }
    await f.call(
      "PATCH",
      `/items/${name}/${item.id}`,
      { required_user: null },
      400,
    );
    await f.call(
      "PATCH",
      `/collections/${name}/fields/source_user`,
      { defaultValue: "invalid" },
      400,
    );
    const filter = encodeURIComponent(
      JSON.stringify([{ field: "source_user", op: "eq", value: sourceId }]),
    );
    const response = await f.app.inject({
      method: "GET",
      url: `/items/${name}?filter=${filter}`,
      headers: f.adminHeaders,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().page.total, "1");
    const updated = await f.call("PATCH", `/items/${name}/${item.id}`, {
      source_user: null,
    });
    assert.equal(updated.source_user, null);
    await f.grant(name, "read", ["source_user"]);
    const limited = await f.call(
      "GET",
      `/items/${name}/${item.id}`,
      undefined,
      200,
      f.memberHeaders,
    );
    assert.equal(limited.source_user, null);
    assert.equal(limited.required_user, undefined);
  } finally {
    await f.close();
  }
});
