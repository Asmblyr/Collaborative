import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("column widths round-trip in personal preferences and views without granting field access", async () => {
  const f = await featureFixture();
  const name = `${f.prefix}_widths`;
  f.names.push(name);
  const { call, memberHeaders } = f;
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
      201,
    );
    const policy = await f.grant(name, "read");
    const path = `/users/me/table-preferences/${name}`;
    const columns = {
      order: ["id", "title", "secret"],
      hidden: ["secret"],
      widths: { id: 80, title: 1200, secret: 224 },
    };
    await call("PATCH", path, { columns }, 200, memberHeaders);
    await call("PATCH", path, { pageSize: 50 }, 200, memberHeaders);
    assert.deepEqual(
      (await call("GET", path, undefined, 200, memberHeaders)).columns,
      columns,
    );
    assert.equal((await call("GET", path)).columns, null);

    const definition = {
      columns,
      pageSize: 25,
      sort: { field: "id", direction: "asc" },
      filter: null,
      q: "",
    };
    const view = await call(
      "POST",
      `/table-views/${name}`,
      { name: "Widths", definition },
      201,
      memberHeaders,
    );
    assert.deepEqual(view.definition.columns, columns);
    assert.deepEqual(
      (
        await call("GET", `/table-views/${name}`, undefined, 200, memberHeaders)
      )[0].definition.columns,
      columns,
    );

    for (const widths of [
      null,
      [],
      "bad",
      { title: 79 },
      { title: 1201 },
      { title: 100.5 },
      { title: "100" },
      { title: null },
      { title: true },
      { missing: 160 },
    ]) {
      await call(
        "PATCH",
        path,
        { columns: { ...columns, widths } },
        400,
        memberHeaders,
      );
      await call(
        "POST",
        `/table-views/${name}`,
        {
          name: "Invalid",
          definition: { ...definition, columns: { ...columns, widths } },
        },
        400,
        memberHeaders,
      );
    }
    assert.deepEqual(
      (await call("GET", path, undefined, 200, memberHeaders)).columns,
      columns,
    );

    // Existing views and clients remain valid without the optional map.
    const legacy = { order: columns.order, hidden: columns.hidden };
    const old = await call(
      "POST",
      `/table-views/${name}`,
      { name: "Legacy", definition: { ...definition, columns: legacy } },
      201,
    );
    assert.deepEqual(old.definition.columns, legacy);
    await call("PATCH", path, { columns: legacy });
    assert.deepEqual((await call("GET", path)).columns, legacy);

    await call(
      "DELETE",
      `/policies/${policy}/users/${f.member.id}`,
      undefined,
      204,
    );
    await f.grant(name, "read", ["title"]);
    const restricted = {
      order: ["id", "title"],
      hidden: [],
      widths: { id: 80, title: 1200 },
    };
    assert.deepEqual(
      (await call("GET", path, undefined, 200, memberHeaders)).columns,
      restricted,
    );
    const views = await call(
      "GET",
      `/table-views/${name}`,
      undefined,
      200,
      memberHeaders,
    );
    assert.deepEqual(
      views.find((entry: { id: string }) => entry.id === view.id).definition
        .columns,
      restricted,
    );
    await call(
      "PATCH",
      path,
      { columns: { ...restricted, widths: { secret: 200 } } },
      400,
      memberHeaders,
    );
    await call(
      "POST",
      `/table-views/${name}`,
      {
        name: "Forbidden width",
        definition: {
          ...definition,
          columns: { ...restricted, widths: { secret: 200 } },
        },
      },
      400,
      memberHeaders,
    );

    await f.db.schema.alterTable(name, (table) => table.dropColumn("title"));
    assert.deepEqual(
      (await call("GET", path, undefined, 200, memberHeaders)).columns,
      { order: ["id"], hidden: [], widths: { id: 80 } },
    );
  } finally {
    await f.close();
  }
});
