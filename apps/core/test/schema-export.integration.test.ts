import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { createClient } from "@asmblyr-collaborative/sdk";
import {
  generateSchemaTypes,
  parseSchemaSnapshot,
} from "@asmblyr-collaborative/sdk/schema";

test("schema export is permission scoped, hash stable, secret free and consumable by SDK", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const [admin, member] = await db("asmblyr_users")
    .insert(
      [true, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const tokens = await Promise.all(
    [admin, member].map((user) => issueUserTokens(db, user.id)),
  );
  const names = ["visible", "private"].map(
    (part) => `test_schema_${part}_${randomUUID().slice(0, 8)}`,
  );
  const policyIds: string[] = [];
  t.after(async () => {
    await app.close();
    if (policyIds.length) {
      await db("asmblyr_policies").whereIn("id", policyIds).delete();
    }
    for (const name of names) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await db("asmblyr_users").whereIn("id", [admin.id, member.id]).delete();
    await db.destroy();
  });
  async function call(
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: object,
    who = 0,
    status = 200,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${tokens[who].accessToken}` },
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json().data;
  }
  for (const name of names) {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "secret", type: "text", defaultValue: "DEFAULT_SECRET" },
          { name: "price", type: "decimal" },
          { name: "tags", type: "json" },
        ],
      },
      0,
      201,
    );
  }
  await call("PUT", `/collections/${names[0]}/fields/price/presentation`, {
    rules: { readonly: true },
  });
  await call("PUT", `/collections/${names[0]}/fields/tags/presentation`, {
    interface: "multiselect",
    options: [
      { value: "news", label: "News" },
      { value: "guide", label: "Guide" },
    ],
  });
  const policy = await call(
    "POST",
    "/policies",
    {
      name: `Schema ${randomUUID()}`,
      userIds: [member.id],
      permissions: [
        {
          collection: names[0],
          action: "read",
          fields: ["title", "price", "tags"],
        },
        {
          collection: names[0],
          action: "create",
          fields: ["title", "price", "tags"],
        },
        {
          collection: names[0],
          action: "update",
          fields: ["title", "price", "tags"],
        },
      ],
    },
    0,
    201,
  );
  policyIds.push(policy.id);
  assert.equal(
    (await app.inject({ method: "GET", url: "/schema" })).statusCode,
    401,
  );
  await call("GET", "/schema?anything=1", undefined, 0, 400);
  const snapshot = await call("GET", "/schema", undefined, 1);
  assert.equal(snapshot.collections.length, 1);
  assert.ok(!JSON.stringify(snapshot).includes(names[1]));
  for (const hidden of [
    "DEFAULT_SECRET",
    '"secret"',
    "defaultValue",
    "password_hash",
  ]) {
    assert.ok(!JSON.stringify(snapshot).includes(hidden));
  }
  const fields = snapshot.collections[0].fields;
  assert.equal(
    fields.find((f: { name: string }) => f.name === "title").requiredOnCreate,
    true,
  );
  assert.equal(
    fields.find((f: { name: string }) => f.name === "price").update,
    false,
  );
  assert.equal(
    fields.find((f: { name: string }) => f.name === "price").type,
    "string",
  );
  assert.equal(
    fields.find((f: { name: string }) => f.name === "tags").type,
    "strings",
  );
  assert.deepEqual(
    fields.find((f: { name: string }) => f.name === "tags").enum,
    ["news", "guide"],
  );
  assert.equal(
    (await call("GET", "/schema", undefined, 1)).hash,
    snapshot.hash,
  );
  const validated = parseSchemaSnapshot(snapshot);
  assert.equal(
    createHash("sha256")
      .update(
        JSON.stringify({ version: 1, collections: validated.collections }),
      )
      .digest("hex"),
    snapshot.hash,
  );
  assert.match(generateSchemaTypes(snapshot), /CollectionSchema/);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const client = createClient({
    baseUrl: app.listeningOrigin,
    accessToken: tokens[1].accessToken,
  });
  assert.equal((await client.schema.pull()).data.hash, snapshot.hash);
});
