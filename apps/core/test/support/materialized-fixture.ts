import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import knex from "knex";
import type { HTTPMethods } from "fastify";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";

export async function materializedFixture(t: TestContext) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const suffix = randomUUID().slice(0, 8);
  const name = `test_mv_${suffix}`;
  const table = `test_mv_source_${suffix}`;
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
  const views = new Set<string>();
  const policies: string[] = [];
  t.after(async () => {
    await app.close();
    await db("asmblyr_policies").whereIn("id", policies).delete();
    for (const view of views) {
      await db("asmblyr_collections").where({ name: view }).delete();
      await db.raw("DROP MATERIALIZED VIEW IF EXISTS ??", [`public.${view}`]);
    }
    await db.schema.dropTableIfExists(table);
    await db("asmblyr_collections").where({ name: table }).delete();
    await db("asmblyr_users").whereIn("id", [admin.id, member.id]).delete();
    await db.destroy();
  });
  async function call(
    method: HTTPMethods,
    url: string,
    payload?: object,
    status = 200,
    who = 0,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${tokens[who].accessToken}` },
    });
    assert.equal(response.statusCode, status, response.body);
    return status === 204 ? undefined : response.json();
  }
  async function view(
    viewName = name,
    select = "SELECT 1::integer AS id, 'First'::text AS title, 10.25::numeric AS price UNION ALL SELECT 2, 'Second', 20.50",
    index = "id",
    populated = true,
  ) {
    views.add(viewName);
    await db.raw(
      `CREATE MATERIALIZED VIEW ?? AS ${select}${populated ? "" : " WITH NO DATA"}`,
      [`public.${viewName}`],
    );
    if (index)
      await db.raw(`CREATE UNIQUE INDEX ?? ON ?? (${index})`, [
        `${viewName}_key`,
        `public.${viewName}`,
      ]);
    return viewName;
  }
  async function policy(permissions: object[]) {
    const result = await call(
      "POST",
      "/policies",
      { name: `View ${suffix}`, userIds: [member.id], permissions },
      201,
    );
    policies.push(result.data.id);
    return result.data;
  }
  return { db, app, call, view, policy, name, table, admin, member, tokens };
}
