import "./require-test-database.js";
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import type { HTTPMethods } from "fastify";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";
export async function systemCollectionFixture(t: TestContext) {
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
  t.after(async () => {
    await app.close();
    await db.destroy();
  });
  async function call(
    method: HTTPMethods,
    url: string,
    payload?: object,
    status = 200,
    actor = 0,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers:
        actor < 0
          ? {}
          : { authorization: `Bearer ${tokens[actor].accessToken}` },
    });
    assert.equal(response.statusCode, status, response.body);
    return response.statusCode === 204 ? undefined : response.json().data;
  }
  const fieldPath = (name: string, field: string) =>
    `/system-collections/${name}/fields/${field}`;
  const create = (
    name: string,
    field: string,
    type = "text",
    extra: object = {},
    presentation = {},
  ) =>
    call(
      "POST",
      `${fieldPath(name, field)}/configuration`,
      { field: { name: field, type, ...extra }, presentation },
      201,
    );
  return { db, app, admin, member, call, fieldPath, create };
}
