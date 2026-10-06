import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { listRelationItems } from "../src/items/relation-list.js";
import type { Access } from "../src/permissions/access.js";

test("automatic relation columns include readable reference context without overriding explicit choices", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const user = await authorizeTestApp(app, database);
  const prefix = `test_rc_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const parent = `${prefix}_parent`;
  const shops = `${prefix}_shops`;
  const child = `${prefix}_child`;
  async function call(
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: object,
  ) {
    const response = await app.inject({ method, url, payload });
    assert.ok(response.statusCode < 300, response.body);
    return response.json();
  }
  try {
    for (const name of [parent, shops, child]) {
      await call("POST", "/collections", {
        name,
        fields: [{ name: "name", type: "text" }],
      });
    }
    await call("POST", `/collections/${child}/relations`, {
      kind: "m2o",
      name: "category_id",
      targetCollection: parent,
      reverseField: "local",
      nullable: true,
    });
    await call("POST", `/collections/${child}/relations`, {
      kind: "m2o",
      name: "shop_id",
      targetCollection: shops,
      nullable: true,
    });
    const parentId = (
      await call("POST", `/items/${parent}`, { name: "Coffee" })
    ).data.id;
    const shopId = (await call("POST", `/items/${shops}`, { name: "Market" }))
      .data.id;
    await call("POST", `/items/${child}`, {
      name: null,
      category_id: parentId,
      shop_id: shopId,
    });
    const path = `/items/${parent}/${parentId}/relations/local`;
    const automatic = await call("GET", path);
    assert.deepEqual(automatic.display.columns, ["id", "name", "shop_id"]);
    assert.equal(automatic.data[0].values.name, null);
    assert.equal(automatic.data[0].values.shop_id, shopId);
    assert.ok(!Object.hasOwn(automatic.data[0].values, "category_id"));
    const access: Access = {
      principal: {
        kind: "user",
        id: user.id,
        email: "test@example.test",
        superuser: false,
        sessionId: "test",
      },
      grants: new Map([
        [`${parent}:read`, ["local"]],
        [`${child}:read`, ["name", "category_id"]],
      ]),
    };
    const restricted = await listRelationItems(
      database,
      { collection: parent, id: parentId, field: "local" },
      access,
      {},
    );
    assert.deepEqual(restricted.display.columns, ["id", "name"]);
    assert.ok(!Object.hasOwn(restricted.data[0].values, "shop_id"));
    await call("PUT", `/collections/${parent}/fields/local/presentation`, {
      relation: { columns: ["name"] },
    });
    assert.deepEqual((await call("GET", path)).display.columns, ["name"]);
  } finally {
    for (const name of [child, shops, parent]) {
      await database.schema.withSchema("public").dropTableIfExists(name);
      await database("asmblyr_collections").where({ name }).delete();
      await database("asmblyr_item_events")
        .where({ collection_name: name })
        .delete();
    }
    await app.close();
    await database.destroy();
  }
});
