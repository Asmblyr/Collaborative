import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("policy configuration saves atomically and isolates shared permissions", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const collection = `test_policy_config_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const users: string[] = [];
  const policies: string[] = [];

  try {
    const [admin] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: true })
      .returning<{ id: string }[]>("id");
    const [member] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    users.push(admin.id, member.id);
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, admin.id)).accessToken}`,
    };
    const createdCollection = await app.inject({
      method: "POST",
      url: "/collections",
      headers,
      payload: {
        name: collection,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
    });
    assert.equal(createdCollection.statusCode, 201, createdCollection.body);

    const grant = (action: string, fields: string[]) => ({
      collection,
      action,
      fields,
    });
    const createPolicy = async (name: string, userIds: string[]) => {
      const response = await app.inject({
        method: "POST",
        url: "/policies",
        headers,
        payload: { name, permissions: [grant("read", ["title"])], userIds },
      });
      assert.equal(response.statusCode, 201, response.body);
      const id = response.json().data.id as string;
      policies.push(id);
      return id;
    };
    const first = await createPolicy(`First ${collection}`, [member.id]);
    const second = await createPolicy(`Second ${collection}`, []);
    const detail = async (id: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/policies/${id}`,
        headers,
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json().data as {
        name: string;
        permissions: { id: string; action: string; fields: string[] }[];
        users: { id: string }[];
      };
    };
    assert.equal(
      (await detail(first)).permissions[0].id,
      (await detail(second)).permissions[0].id,
    );

    const changed = await app.inject({
      method: "PATCH",
      url: `/policies/${first}`,
      headers,
      payload: {
        name: `Changed ${collection}`,
        permissions: [grant("read", ["secret"]), grant("update", ["title"])],
        userIds: [],
      },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const firstAfter = await detail(first);
    const secondAfter = await detail(second);
    assert.equal(firstAfter.name, `Changed ${collection}`);
    assert.deepEqual(
      firstAfter.permissions.map((entry) => [entry.action, entry.fields]),
      [
        ["read", ["secret"]],
        ["update", ["title"]],
      ],
    );
    assert.deepEqual(firstAfter.users, []);
    assert.deepEqual(
      secondAfter.permissions.map((entry) => [entry.action, entry.fields]),
      [["read", ["title"]]],
    );
    assert.deepEqual(secondAfter.users, []);

    const invalid = await app.inject({
      method: "PATCH",
      url: `/policies/${first}`,
      headers,
      payload: {
        name: `Should rollback ${collection}`,
        permissions: [grant("read", ["title"]), grant("update", ["missing"])],
        userIds: [member.id],
      },
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.deepEqual(await detail(first), firstAfter);

    const missingUser = await app.inject({
      method: "PATCH",
      url: `/policies/${first}`,
      headers,
      payload: {
        name: `Should rollback ${collection}`,
        permissions: [grant("create", ["title"])],
        userIds: [randomUUID()],
      },
    });
    assert.equal(missingUser.statusCode, 404, missingUser.body);
    assert.deepEqual(await detail(first), firstAfter);
  } finally {
    for (const id of policies) {
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id })
        .delete();
    }
    await database.schema.withSchema("public").dropTableIfExists(collection);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name: collection })
      .delete();
    if (users.length > 0)
      await database("asmblyr_users")
        .withSchema("public")
        .whereIn("id", users)
        .delete();
    await database.destroy();
    await app.close();
  }
});
