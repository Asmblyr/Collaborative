import "./require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";
import { loadAccess } from "../../src/permissions/access.js";
import type { AssistantService } from "../../src/assistant/service.js";
import { authorizeTestApp } from "./authorized-app.js";

export async function mcpFixture(t: TestContext, assistant?: AssistantService) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    assistant,
  });
  await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const names = {
    posts: `test_mcp_posts_${suffix}`,
    people: `test_mcp_people_${suffix}`,
    denied: `test_mcp_denied_${suffix}`,
    disabled: `test_mcp_disabled_${suffix}`,
  };
  const userId = randomUUID();
  let policyId = "";
  t.after(async () => {
    for (const name of Object.values(names)) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    if (policyId) await db("asmblyr_policies").where({ id: policyId }).delete();
    await db("asmblyr_assistant_requests").where({ user_id: userId }).delete();
    await db("asmblyr_users").where({ id: userId }).delete();
    await app.close();
    await db.destroy();
  });

  for (const name of Object.values(names)) {
    const isPeople = name === names.people;
    const response = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        primaryKey: {
          name: isPeople ? "code" : "id",
          type: isPeople ? "text" : "serial",
        },
        hidden: isPeople,
        displayName: isPeople ? "Directory" : null,
        mcp: {
          enabled: name !== names.disabled,
          description: `Purpose of ${name}`,
        },
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
    });
    assert.equal(response.statusCode, 201, response.body);
  }
  const relation = await app.inject({
    method: "POST",
    url: `/collections/${names.posts}/relations`,
    payload: { name: "author_id", targetCollection: names.people },
  });
  assert.equal(relation.statusCode, 201, relation.body);
  await db(names.people).insert({
    code: "author-a",
    title: "Ada",
    secret: "hidden-person-value",
  });
  await db(names.posts).insert([
    { title: "Alpha", author_id: "author-a", secret: "hidden-post-value" },
    { title: "Beta", secret: "hidden-post-value" },
  ]);
  await db("asmblyr_users").insert({
    id: userId,
    email: `${userId}@example.test`,
    superuser: false,
  });
  const policy = await app.inject({
    method: "POST",
    url: "/policies",
    payload: { name: `MCP ${suffix}` },
  });
  assert.equal(policy.statusCode, 201, policy.body);
  policyId = policy.json().data.id;
  const permissions = new Map<string, string>();
  for (const name of [names.posts, names.people, names.disabled]) {
    const fields = name === names.posts ? ["title", "author_id"] : ["title"];
    const response = await app.inject({
      method: "POST",
      url: "/permissions",
      payload: { collection: name, action: "read", fields },
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id;
    permissions.set(name, id);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/permissions/${id}`,
        })
      ).statusCode,
      204,
    );
  }
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/policies/${policyId}/users/${userId}`,
      })
    ).statusCode,
    204,
  );
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, userId)).accessToken}`,
  };
  const reload = () => loadAccess(db, headers.authorization);
  return {
    app,
    db,
    names,
    suffix,
    headers,
    permissions,
    reload,
    access: await reload(),
  };
}
