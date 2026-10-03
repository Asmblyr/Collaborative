import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";

export async function delegationFixture(t: TestContext) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const policyIds: string[] = [];
  const serviceIds: string[] = [];
  const userIds: string[] = [];
  t.after(async () => {
    await db("public.asmblyr_service_accounts")
      .whereIn("id", serviceIds)
      .delete();
    await db("public.asmblyr_policies").whereIn("id", policyIds).delete();
    await db("public.asmblyr_security_events")
      .whereIn("actor_id", userIds)
      .delete();
    await db("public.asmblyr_users").whereIn("id", userIds).delete();
    await app.close();
    await db.destroy();
  });
  const users = await db("public.asmblyr_users")
    .insert(
      Array.from({ length: 4 }, (_, i) => ({
        email: `${randomUUID()}@delegation.test`,
        superuser: i === 0,
      })),
    )
    .returning<{ id: string }[]>("id");
  userIds.push(...users.map((user) => user.id));
  const headers = await Promise.all(
    userIds.map(async (id) => ({
      authorization: `Bearer ${(await issueUserTokens(db, id)).accessToken}`,
    })),
  );
  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    actor = 1,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: headers[actor],
      ...(payload ? { payload } : {}),
    });
  async function policy(
    permissions: object[],
    assigned: string[] = [],
  ): Promise<string> {
    const response = await call("POST", "/policies", 0, {
      name: randomUUID(),
      permissions,
      userIds: assigned,
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id as string;
    policyIds.push(id);
    return id;
  }
  async function service(policies: string[], actor = 0): Promise<string> {
    const response = await call("POST", "/service-accounts", actor, {
      name: randomUUID(),
      policyIds: policies,
    });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().data.id as string;
    serviceIds.push(id);
    return id;
  }
  const ready = await policy([
    { section: "assistant", action: "read", fields: ["*"] },
  ]);
  const blocked = await policy([
    { section: "policies", action: "update", fields: ["*"] },
  ]);
  const manager = await policy(
    ["users", "policies", "services"].map((section) => ({
      section,
      action: "update",
      fields: ["*"],
    })),
    [userIds[1]],
  );
  async function allow(ids: string[]) {
    const response = await call("PUT", `/users/${userIds[1]}/delegation`, 0, {
      policyIds: ids,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response;
  }
  return {
    db,
    app,
    call,
    headers,
    userIds,
    policyIds,
    serviceIds,
    ready,
    blocked,
    manager,
    allow,
    policy,
    service,
  };
}
