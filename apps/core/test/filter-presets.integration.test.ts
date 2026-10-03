import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("saved filters are scoped to their owner and rechecked against current access", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_presets_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let readerId: string | undefined;
  let policyId: string | undefined;
  const filter = {
    logic: "and",
    children: [{ field: "title", op: "contains", value: "Alpha" }],
  };

  try {
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name, fields: [{ name: "title", type: "text" }] },
    });
    assert.equal(collection.statusCode, 201, collection.body);
    const saved = await app.inject({
      method: "POST",
      url: `/filter-presets/${name}`,
      payload: { name: "Alpha items", filter },
    });
    assert.equal(saved.statusCode, 201, saved.body);
    const id = saved.json().data.id as string;
    const listed = await app.inject({
      method: "GET",
      url: `/filter-presets/${name}`,
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().data.length, 1);
    assert.equal(listed.json().data[0].available, true);
    assert.deepEqual(listed.json().data[0].filter, filter);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/filter-presets/${name}`,
          payload: { name: "ALPHA ITEMS", filter },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/filter-presets/${name}`,
          payload: {
            name: "Bad",
            filter: {
              logic: "and",
              children: [{ field: "missing", op: "eq", value: "x" }],
            },
          },
        })
      ).statusCode,
      400,
    );

    const [reader] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    readerId = reader.id;
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, reader.id)).accessToken}`,
    };
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/filter-presets/${name}`,
          headers,
        })
      ).statusCode,
      403,
    );
    const policy = await app.inject({
      method: "POST",
      url: "/policies",
      payload: { name: `Filter preset reader ${name}` },
    });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const permission = await app.inject({
      method: "POST",
      url: "/permissions",
      payload: { collection: name, action: "read", fields: ["title"] },
    });
    assert.equal(permission.statusCode, 201, permission.body);
    const permissionId = permission.json().data.id as string;
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/permissions/${permissionId}`,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/users/${reader.id}`,
        })
      ).statusCode,
      204,
    );
    const empty = await app.inject({
      method: "GET",
      url: `/filter-presets/${name}`,
      headers,
    });
    assert.equal(empty.statusCode, 200, empty.body);
    assert.deepEqual(empty.json().data, []);
    const own = await app.inject({
      method: "POST",
      url: `/filter-presets/${name}`,
      headers,
      payload: { name: "My filter", filter },
    });
    assert.equal(own.statusCode, 201, own.body);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/filter-presets/${name}/${id}`,
          headers,
          payload: { name: "Stolen", filter },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/filter-presets/${name}/${id}`,
          headers,
        })
      ).statusCode,
      404,
    );

    const restricted = await app.inject({
      method: "PATCH",
      url: `/permissions/${permissionId}`,
      payload: { fields: ["id"] },
    });
    assert.equal(restricted.statusCode, 200, restricted.body);
    const unavailable = await app.inject({
      method: "GET",
      url: `/filter-presets/${name}`,
      headers,
    });
    assert.equal(unavailable.statusCode, 200, unavailable.body);
    assert.equal(unavailable.json().data[0].available, false);
    assert.equal(unavailable.json().data[0].filter, null);

    const updated = await app.inject({
      method: "PUT",
      url: `/filter-presets/${name}/${id}`,
      payload: { name: "Updated", filter },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.name, "Updated");
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/filter-presets/${name}/${id}`,
        })
      ).statusCode,
      204,
    );
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .delete();
    if (policyId)
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id: policyId })
        .delete();
    if (readerId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: readerId })
        .delete();
    await app.close();
    await database.destroy();
  }
});
