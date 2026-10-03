import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("extension field configuration persists atomically and retains data validation and permissions", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_color_${randomUUID().slice(0, 8)}`;
  let memberId: string | undefined;
  const extension = {
    id: "not_installed:picker",
    options: { palette: ["#123456"], allowCustom: false },
  };
  const base = `/collections/${name}/fields`;

  try {
    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name },
    });
    assert.equal(created.statusCode, 201, created.body);
    const configured = await app.inject({
      method: "POST",
      url: `${base}/color/configuration`,
      payload: {
        field: { name: "color", type: "text", required: true, nullable: true },
        presentation: { extension, constraints: { maxLength: 7 } },
      },
    });
    assert.equal(configured.statusCode, 201, configured.body);

    const catalog = await app.inject({ method: "GET", url: "/collections" });
    const collection = catalog
      .json()
      .data.find((entry: { name: string }) => entry.name === name);
    assert.deepEqual(collection.fields[0].presentation.extension, extension);
    assert.equal(collection.fields[0].type, "text");

    for (const color of [null, "too long for field"]) {
      const invalid = await app.inject({
        method: "POST",
        url: `/items/${name}`,
        payload: { color },
      });
      assert.equal(invalid.statusCode, 400, invalid.body);
    }
    // Palette is presentation, not an extra authorization or data constraint.
    const item = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: { color: "#abcdef" },
    });
    assert.equal(item.statusCode, 201, item.body);
    const id = item.json().data.id;

    const failed = await app.inject({
      method: "POST",
      url: `${base}/wrong/configuration`,
      payload: {
        field: { name: "wrong", type: "integer" },
        presentation: { extension },
      },
    });
    assert.equal(failed.statusCode, 400, failed.body);
    assert.equal(await database.schema.hasColumn(name, "wrong"), false);

    const [member] = await database("asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test` })
      .returning("id");
    memberId = member.id;
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, member.id)).accessToken}`,
    };
    const forbidden = await app.inject({
      method: "PUT",
      url: `${base}/color/presentation`,
      headers,
      payload: { extension },
    });
    assert.equal(forbidden.statusCode, 403, forbidden.body);
    const write = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      headers,
      payload: { color: "#000000" },
    });
    assert.equal(write.statusCode, 403, write.body);

    const reset = await app.inject({
      method: "PUT",
      url: `${base}/color/presentation`,
      payload: {},
    });
    assert.equal(reset.statusCode, 200, reset.body);
    const unchanged = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
    });
    assert.equal(unchanged.json().data.color, "#abcdef");
  } finally {
    await database.schema.dropTableIfExists(name);
    await database("asmblyr_collections").where({ name }).delete();
    await database("asmblyr_item_events")
      .where({ collection_name: name })
      .delete();
    if (memberId) {
      await database("asmblyr_users").where({ id: memberId }).delete();
    }
    await app.close();
    await database.destroy();
  }
});
