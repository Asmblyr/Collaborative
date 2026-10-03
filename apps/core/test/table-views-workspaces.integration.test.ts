import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("named views are personal and shared workspaces never grant data access", async (t) => {
  const f = await featureFixture(),
    name = `${f.prefix}_views`,
    other = `${f.prefix}_other`;
  f.names.push(name, other);
  const { call, db, memberHeaders } = f;
  try {
    for (const collection of f.names)
      await call(
        "POST",
        "/collections",
        {
          name: collection,
          fields: [
            { name: "title", type: "text" },
            { name: "secret", type: "text" },
          ],
        },
        201,
      );
    const definition = {
      columns: { order: ["title", "secret", "id"], hidden: ["secret"] },
      pageSize: 50,
      sort: { field: "secret", direction: "desc" },
      filter: {
        logic: "and",
        children: [{ field: "title", op: "contains", value: "hello" }],
      },
      q: "sample",
    };
    const adminView = await call(
      "POST",
      `/table-views/${name}`,
      { name: "Main", definition },
      201,
    );
    const policy = await f.grant(name, "read");
    await t.test(
      "complete definitions, ownership and invalid input",
      async () => {
        assert.deepEqual(adminView.definition, definition);
        await call(
          "POST",
          `/table-views/${name}`,
          { name: "Main", definition },
          409,
        );
        assert.deepEqual(
          await call(
            "GET",
            `/table-views/${name}`,
            undefined,
            200,
            memberHeaders,
          ),
          [],
        );
        await call(
          "PUT",
          `/table-views/${name}/${adminView.id}`,
          { name: "Hijack", definition },
          404,
          memberHeaders,
        );
        await call(
          "DELETE",
          `/table-views/${name}/${adminView.id}`,
          undefined,
          404,
          memberHeaders,
        );
        await call(
          "POST",
          `/table-views/${name}`,
          { name: "Bad", definition: { ...definition, pageSize: 1000 } },
          400,
        );
        await call(
          "POST",
          `/table-views/${name}`,
          {
            name: "Bad",
            definition: {
              ...definition,
              columns: { order: ["missing"], hidden: [] },
            },
          },
          400,
        );
        const personal = await call(
          "POST",
          `/table-views/${name}`,
          { name: "Personal", definition },
          201,
          memberHeaders,
        );
        const filtered = await call(
          "POST",
          `/table-views/${name}`,
          {
            name: "Sensitive",
            definition: {
              ...definition,
              filter: {
                logic: "and",
                children: [{ field: "secret", op: "eq", value: "private" }],
              },
            },
          },
          201,
          memberHeaders,
        );
        await call(
          "DELETE",
          `/policies/${policy}/users/${f.member.id}`,
          undefined,
          204,
        );
        await f.grant(name, "read", ["title"]);
        const repaired = await call(
          "GET",
          `/table-views/${name}`,
          undefined,
          200,
          memberHeaders,
        );
        const valid = repaired.find(
          (v: { id: string }) => v.id === personal.id,
        );
        assert.equal(valid.definition.sort.field, "id");
        assert.deepEqual(valid.definition.columns.order, ["title", "id"]);
        const unavailable = repaired.find(
          (v: { id: string }) => v.id === filtered.id,
        );
        assert.equal(unavailable.available, false);
        assert.equal(unavailable.definition, null);
      },
    );
    await t.test(
      "workspace membership is shared, selection is personal and deletion preserves collections",
      async () => {
        const workspace = await call(
          "POST",
          "/workspaces",
          { name: f.prefix, description: "Test", collections: [name, other] },
          201,
        );
        const hidden = await call(
          "POST",
          "/workspaces",
          { name: `${f.prefix}_hidden`, collections: [other] },
          201,
        );
        const listing = await call(
          "GET",
          "/workspaces",
          undefined,
          200,
          memberHeaders,
        );
        assert.deepEqual(
          listing.workspaces.find((w: { id: string }) => w.id === workspace.id)
            .collections,
          [name],
        );
        assert.ok(
          !listing.workspaces.some((w: { id: string }) => w.id === hidden.id),
        );
        await call(
          "PUT",
          "/users/me/workspace",
          { workspaceId: hidden.id },
          404,
          memberHeaders,
        );
        await call(
          "PUT",
          "/users/me/workspace",
          { workspaceId: workspace.id },
          200,
          memberHeaders,
        );
        assert.equal(
          (await call("GET", "/workspaces", undefined, 200, memberHeaders))
            .selectedId,
          workspace.id,
        );
        assert.equal((await call("GET", "/workspaces")).selectedId, null);
        await call("GET", `/items/${other}`, undefined, 403, memberHeaders);
        await call(
          "POST",
          "/workspaces",
          { name: "Denied", collections: [name] },
          403,
          memberHeaders,
        );
        await call(
          "PUT",
          `/workspaces/${workspace.id}`,
          { name: f.prefix, collections: ["missing"] },
          404,
        );
        const created = `${f.prefix}_new`,
          rejected = `${f.prefix}_rejected`;
        f.names.push(created, rejected);
        await call(
          "POST",
          "/collections",
          { name: created, workspaceId: workspace.id, fields: [] },
          201,
        );
        assert.ok(
          (await call("GET", "/workspaces")).workspaces
            .find((w: { id: string }) => w.id === workspace.id)
            .collections.includes(created),
        );
        await call(
          "POST",
          "/collections",
          {
            name: rejected,
            workspaceId: "00000000-0000-4000-8000-000000000000",
            fields: [],
          },
          404,
        );
        assert.equal(await db.schema.hasTable(rejected), false);
        assert.equal(
          (await db("asmblyr_collections").where({ name: rejected })).length,
          0,
        );
        await call("DELETE", `/workspaces/${workspace.id}`, undefined, 204);
        assert.equal(
          (await call("GET", "/workspaces", undefined, 200, memberHeaders))
            .selectedId,
          null,
        );
        assert.equal(
          (await db("asmblyr_collections").whereIn("name", f.names)).length,
          3,
        );
      },
    );
    await t.test(
      "deleted fields are reconciled without changing stored data",
      async () => {
        await call(
          "DELETE",
          `/collections/${name}/fields/secret`,
          undefined,
          204,
        );
        const repaired = (await call("GET", `/table-views/${name}`))[0];
        assert.equal(repaired.definition.sort.field, "id");
        assert.ok(!repaired.definition.columns.order.includes("secret"));
        await call(
          "DELETE",
          `/table-views/${name}/${adminView.id}`,
          undefined,
          204,
        );
      },
    );
  } finally {
    await f.close();
  }
});
