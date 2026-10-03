import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("search respects readable fields and keeps filtered pagination consistent", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const name = `test_search_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const users: string[] = [];
  let policyId: string | undefined;

  try {
    const [admin, reader] = await database("asmblyr_users").withSchema("public")
      .insert([{ email: `${randomUUID()}@example.test`, superuser: true },
        { email: `${randomUUID()}@example.test`, superuser: false }])
      .returning<{ id: string }[]>("id");
    users.push(admin.id, reader.id);
    const adminHeaders = { authorization: `Bearer ${(await issueUserTokens(database, admin.id)).accessToken}` };
    const readerHeaders = { authorization: `Bearer ${(await issueUserTokens(database, reader.id)).accessToken}` };
    const created = await app.inject({ method: "POST", url: "/collections", headers: adminHeaders,
      payload: { name, fields: [{ name: "title", type: "text" },
        { name: "secret", type: "text" }] } });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.fields[0].searchable, true);
    for (const [title, secret] of [["Alpha %", "private-one"],
      ["Alpha beta", "private-two"], ["Other", "hidden-alpha"],
      ["Literal_test", "neutral"], ["Slash\\test", "neutral"]]) {
      const item = await app.inject({ method: "POST", url: `/items/${name}`,
        headers: adminHeaders, payload: { title, secret } });
      assert.equal(item.statusCode, 201, item.body);
    }
    const policy = await app.inject({ method: "POST", url: "/policies", headers: adminHeaders,
      payload: { name: `Reader ${name}` } });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const permission = await app.inject({ method: "POST", url: "/permissions",
      headers: adminHeaders, payload: { collection: name, action: "read", fields: ["title"] } });
    assert.equal(permission.statusCode, 201, permission.body);
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/permissions/${permission.json().data.id}`,
      headers: adminHeaders })).statusCode, 204);
    assert.equal((await app.inject({ method: "PUT", url: `/policies/${policyId}/users/${reader.id}`,
      headers: adminHeaders })).statusCode, 204);

    const first = await app.inject({ method: "GET", url: `/items/${name}?q=alpha&limit=1`,
      headers: readerHeaders });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().page.total, "2");
    assert.equal(first.json().data.length, 1);
    const second = await app.inject({ method: "GET", url: `/items/${name}?q=alpha&limit=1&page=2`,
      headers: readerHeaders });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().page.total, "2");
    assert.notEqual(second.json().data[0].id, first.json().data[0].id);
    const hidden = await app.inject({ method: "GET", url: `/items/${name}?q=private`,
      headers: readerHeaders });
    assert.deepEqual(hidden.json().data, []);
    assert.equal(hidden.json().page.total, "0");
    const literal = await app.inject({ method: "GET", url: `/items/${name}?q=%25`,
      headers: readerHeaders });
    assert.equal(literal.json().page.total, "1");
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}?q=%5F`,
      headers: readerHeaders })).json().page.total, "1");
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}?q=%5C`,
      headers: readerHeaders })).json().page.total, "1");

    const global = await app.inject({ method: "GET", url: "/search?q=alpha",
      headers: readerHeaders });
    assert.equal(global.statusCode, 200, global.body);
    assert.deepEqual(global.json().items.filter((item: { collection: string }) =>
      item.collection === name).map((item: { label: string }) => item.label).sort(),
    ["Alpha %", "Alpha beta"]);
    assert.ok(global.json().items.every((item: { label: string }) => !item.label.includes("private")));
    assert.deepEqual((await app.inject({ method: "GET", url: "/search?q=private",
      headers: readerHeaders })).json().items, []);
    assert.ok((await app.inject({ method: "GET", url: `/search?q=${name}`,
      headers: readerHeaders })).json().collections.some((item: { name: string }) => item.name === name));
    assert.equal((await app.inject({ method: "GET", url: "/search?q=".concat("x".repeat(101)),
      headers: readerHeaders })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: "/search?q=alpha" })).statusCode, 401);

    const settingsUrl = `/collections/${name}/fields/title/search`;
    assert.equal((await app.inject({ method: "PUT", url: settingsUrl,
      headers: readerHeaders, payload: { searchable: false, indexed: true } })).statusCode, 403);
    const disabled = await app.inject({ method: "PUT", url: settingsUrl,
      headers: adminHeaders, payload: { searchable: false, indexed: true } });
    assert.equal(disabled.statusCode, 200, disabled.body);
    const indexName = `asmblyr_search_${createHash("md5")
      .update(`${name}:title`).digest("hex").slice(0, 24)}`;
    const indexed = await database.raw<{ rows: { valid: boolean }[] }>(`
      SELECT ix.indisvalid AS valid FROM pg_index AS ix
      JOIN pg_class AS c ON c.oid = ix.indexrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ?
    `, [indexName]);
    assert.equal(indexed.rows[0]?.valid, true);
    const catalog = await app.inject({ method: "GET", url: "/collections", headers: adminHeaders });
    const configured = catalog.json().data.find((entry: { name: string }) => entry.name === name)
      .fields.find((entry: { name: string }) => entry.name === "title");
    assert.equal(configured.searchable, false);
    assert.equal(configured.searchIndexed, true);
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}?q=alpha`,
      headers: readerHeaders })).json().page.total, "0");
    assert.deepEqual((await app.inject({ method: "GET", url: "/search?q=alpha",
      headers: readerHeaders })).json().items, []);
    const enabled = await app.inject({ method: "PUT", url: settingsUrl,
      headers: adminHeaders, payload: { searchable: true, indexed: true } });
    assert.equal(enabled.statusCode, 200, enabled.body);
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}?q=alpha`,
      headers: readerHeaders })).json().page.total, "2");
    await database.transaction(async (transaction) => {
      await transaction.raw("SET LOCAL enable_seqscan = off");
      const plan = await transaction.raw<{ rows: { "QUERY PLAN": string }[] }>(
        "EXPLAIN SELECT ?? FROM ?? WHERE lower(??) LIKE lower(?) ESCAPE E'\\\\'",
        ["id", `public.${name}`, "title", "%alpha%"],
      );
      assert.match(plan.rows.map((row) => row["QUERY PLAN"]).join("\n"), new RegExp(indexName));
    });
    assert.equal((await app.inject({ method: "PUT", url: settingsUrl,
      headers: adminHeaders, payload: { searchable: true, indexed: false } })).statusCode, 200);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    if (policyId) await database("asmblyr_policies").withSchema("public").where({ id: policyId }).delete();
    if (users.length) await database("asmblyr_users").withSchema("public").whereIn("id", users).delete();
    await app.close();
    await database.destroy();
  }
});
