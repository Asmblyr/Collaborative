import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@asmblyr-collaborative/sdk";
import {
  generateSchemaTypes,
  parseSchemaSnapshot,
} from "@asmblyr-collaborative/sdk/schema";
import { materializedFixture } from "./support/materialized-fixture.js";
import { lockedCollectionSchema } from "../src/items/schema-repository.js";

test("materialized collections support reads and display metadata, with unconditional write protection", async (t) => {
  const { db, app, call, view, policy, name, table, tokens } =
    await materializedFixture(t);
  await view();
  assert.ok(
    !(await call("GET", "/collections")).data.some(
      (c: { name: string }) => c.name === name,
    ),
  );
  await call("POST", "/materialized-views", { name, primaryKey: "id" }, 403, 1);
  const connected = (
    await call(
      "POST",
      "/materialized-views",
      {
        name,
        primaryKey: "id",
        displayName: "Report",
        displayField: "title",
        presentations: { price: { label: "Amount" } },
      },
      201,
    )
  ).data;
  assert.equal(connected.sourceKind, "materialized-view");
  assert.equal(
    connected.fields.find((f: { name: string }) => f.name === "price")
      .presentation.label,
    "Amount",
  );
  assert.equal((await call("GET", `/items/${name}/1`)).data.title, "First");
  const listing = await call(
    "GET",
    `/items/${name}?sort=price&direction=desc&limit=1`,
  );
  assert.equal(listing.data[0].title, "Second");
  assert.equal(listing.data[0].price, "20.50");

  const catalog = (await call("GET", "/collections")).data.find(
    (c: { name: string }) => c.name === name,
  );
  assert.deepEqual(catalog.access, {
    read: ["*"],
    create: null,
    update: null,
    delete: false,
    structure: true,
  });
  assert.ok(
    !(await call("GET", "/collections", undefined, 200, 1)).data.some(
      (c: { name: string }) => c.name === name,
    ),
  );
  await policy([
    {
      collection: name,
      action: "read",
      fields: ["title"],
      rowFilter: {
        logic: "and",
        children: [
          {
            field: "title",
            op: "eq",
            value: { kind: "literal", value: "First" },
          },
        ],
      },
    },
  ]);
  const limited = await call("GET", `/items/${name}`, undefined, 200, 1);
  assert.equal(limited.data.length, 1);
  assert.equal(limited.data[0].title, "First");
  assert.ok(!Object.hasOwn(limited.data[0], "price"));
  await call("GET", `/items/${name}/2`, undefined, 404, 1);

  await t.test(
    "single, bulk, root and nested commits cannot mutate a view",
    async () => {
      await call("POST", `/items/${name}`, { title: "Bad" }, 403);
      await call("PATCH", `/items/${name}/1`, { title: "Bad" }, 403);
      await call("DELETE", `/items/${name}/1`, undefined, 403);
      await call(
        "PATCH",
        `/items/${name}`,
        { ids: [1], values: { title: "Bad" } },
        403,
      );
      await call("POST", `/items/${name}/commit`, { id: "1", values: {} }, 403);
      await assert.rejects(
        db.transaction((trx) => lockedCollectionSchema(trx, name)),
        { statusCode: 403, code: "COLLECTION_READ_ONLY" },
      );
      await call(
        "POST",
        "/collections",
        { name: table, fields: [{ name: "title", type: "text" }] },
        201,
      );
      const item = (
        await call("POST", `/items/${table}`, { title: "Original" }, 201)
      ).data;
      await call(
        "POST",
        `/items/${table}/commit`,
        {
          id: item.id,
          values: { title: "Changed" },
          records: [
            { collection: name, record: { id: "1", values: { title: "Bad" } } },
          ],
        },
        403,
      );
      assert.equal(
        (await call("GET", `/items/${table}/${item.id}`)).data.title,
        "Original",
      );
      assert.equal((await call("GET", `/items/${name}/1`)).data.title, "First");
    },
  );

  await t.test(
    "physical structure, index, state and write grants are blocked",
    async () => {
      await call(
        "POST",
        `/collections/${name}/fields`,
        { name: "extra", type: "text" },
        403,
      );
      await call(
        "PATCH",
        `/collections/${name}/fields/title`,
        { nullable: false },
        403,
      );
      await call("DELETE", `/collections/${name}/fields/title`, undefined, 403);
      await call("DELETE", `/collections/${name}`, undefined, 403);
      await call(
        "PUT",
        `/collections/${name}/fields/title/search`,
        { searchable: false, indexed: false },
        403,
      );
      await call(
        "PATCH",
        `/collections/${name}/settings`,
        { state: null },
        403,
      );
      await call(
        "PUT",
        `/collections/${name}/fields/title/presentation`,
        { rules: { readonly: true } },
        400,
      );
      await call(
        "POST",
        `/collections/${table}/relations`,
        { kind: "m2o", name: "report_id", targetCollection: name },
        403,
      );
      await call(
        "POST",
        "/policies",
        {
          name: "Cannot write report",
          permissions: [
            { collection: name, action: "update", fields: ["title"] },
          ],
        },
        400,
      );
      await call("POST", `/materialized-views/${name}/refresh`, {}, 404);
      await call(
        "POST",
        "/materialized-views",
        { name, primaryKey: "id" },
        409,
      );
    },
  );

  await t.test(
    "presentation and exported SDK contract remain read only",
    async () => {
      await call("PUT", `/collections/${name}/fields/price/presentation`, {
        label: "Revenue",
        display: {
          kind: "number",
          decimals: 2,
          grouping: true,
          prefix: "",
          suffix: " USD",
        },
      });
      await call("PATCH", `/collections/${name}/settings`, {
        displayName: "Sales report",
        translations: { en: { label: "Sales" } },
        mcp: { enabled: true },
      });
      await call("PUT", `/collections/${name}/display`, {
        displayField: "title",
      });
      await call("PUT", `/collections/${name}/form`, {
        version: 1,
        tabs: [
          {
            id: "main",
            label: "Report",
            children: [
              { id: "title", kind: "field", field: "title", width: "full" },
            ],
          },
        ],
      });
      const snapshot = parseSchemaSnapshot((await call("GET", "/schema")).data);
      const schema = snapshot.collections.find((c) => c.name === name)!;
      assert.equal(schema.sourceKind, "materialized-view");
      assert.deepEqual(schema.actions, {
        read: true,
        create: false,
        update: false,
        delete: false,
      });
      assert.ok(
        schema.fields.every(
          (f) => !f.create && !f.update && !f.requiredOnCreate,
        ),
      );
      assert.match(
        generateSchemaTypes(snapshot),
        new RegExp(`"${name}": never`),
      );
      await app.listen({ host: "127.0.0.1", port: 0 });
      const client = createClient({
        baseUrl: app.listeningOrigin,
        accessToken: tokens[0].accessToken,
      });
      assert.equal((await client.items.get(name, 1)).data.title, "First");
      await assert.rejects(client.items.update(name, 1, { title: "Bad" }));
    },
  );

  await t.test(
    "disconnect removes metadata, preserves the physical source, and supports reconnection",
    async () => {
      await call(
        "DELETE",
        `/collections/${name}/materialized-view`,
        undefined,
        204,
      );
      assert.equal((await db(name).count("*").first())!.count, "2");
      assert.equal(
        await db("asmblyr_field_metadata")
          .where({ collection_name: name })
          .first(),
        undefined,
      );
      await call("GET", `/items/${name}`, undefined, 404);
      await call(
        "POST",
        "/materialized-views",
        { name, primaryKey: "id" },
        201,
      );
      await call("GET", `/items/${name}`, undefined, 403, 1);
      await call("GET", `/items/${name}`, undefined, 200);
    },
  );
});
