import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  useAsmblyr,
  type ItemListOptions,
  type ItemReadOptions,
} from "@asmblyr/kit";
import { readBody } from "h3";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";
import type { LoadedPlugin } from "../../src/plugins/definition.js";
import type { PermissionAction } from "../../src/permissions/validation.js";

export async function pluginItemsFixture(
  options: { collection?: string; plugins?: LoadedPlugin[] } = {},
) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [
      ...(options.plugins ?? []),
      {
        name: "reader",
        capabilities: ["items.read"],
        definition: {},
        endpoints: [
          {
            method: "POST",
            path: "/reader/list",
            handler: async (event) => {
              const body = await readBody<{
                collection: string;
                options?: ItemListOptions;
              }>(event);
              assert.ok(body);
              const { collection, options } = body;
              const context = useAsmblyr(event);
              assert.ok(Object.isFrozen(context));
              assert.ok(Object.isFrozen(context.items));
              assert.ok(
                Object.keys(context.actor).every((key) =>
                  ["id", "kind", "displayName"].includes(key),
                ),
              );
              assert.equal(typeof context.actor.id, "string");
              assert.deepEqual(Object.keys(context.items).sort(), [
                "commit",
                "create",
                "delete",
                "get",
                "list",
                "update",
              ]);
              return context.items.list(collection, options);
            },
          },
          {
            method: "POST",
            path: "/reader/get",
            handler: async (event) => {
              const body = await readBody<{
                collection: string;
                id: string | number;
                options?: ItemReadOptions;
              }>(event);
              assert.ok(body);
              const { collection, id, options } = body;
              return useAsmblyr(event).items.get(collection, id, options);
            },
          },
        ],
      },
    ],
  });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const [admin, member, outsider] = await db("asmblyr_users")
    .insert([
      { email: `sdk-admin-${suffix}@example.test`, superuser: true },
      { email: `sdk-member-${suffix}@example.test`, superuser: false },
      { email: `sdk-other-${suffix}@example.test`, superuser: false },
    ])
    .returning<{ id: string }[]>("id");
  const adminToken = (await issueUserTokens(db, admin.id)).accessToken;
  const memberToken = (await issueUserTokens(db, member.id)).accessToken;
  const outsiderToken = (await issueUserTokens(db, outsider.id)).accessToken;

  async function call(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
    status = 200,
    token: string | null = adminToken,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    assert.equal(
      response.statusCode,
      status,
      `${method} ${url}: ${response.body}`,
    );
    if (status === 204) {
      return undefined;
    }
    return response.json();
  }

  async function grant(
    collection: string,
    fields: string[],
    userId = member.id,
    action: PermissionAction = "read",
  ) {
    const policy = (
      await call("POST", "/policies", { name: `SDK ${randomUUID()}` }, 201)
    ).data;
    const permission = (
      await call("POST", "/permissions", { collection, action, fields }, 201)
    ).data;
    await call(
      "PUT",
      `/policies/${policy.id}/permissions/${permission.id}`,
      undefined,
      204,
    );
    await call("PUT", `/policies/${policy.id}/users/${userId}`, undefined, 204);
    return {
      policyId: policy.id as string,
      permissionId: permission.id as string,
    };
  }

  const collection = options.collection ?? `test_sdk_${suffix}`;
  await call(
    "POST",
    "/collections",
    {
      name: collection,
      primaryKey: { name: "id", type: "serial" },
      timestamps: { createdAt: true, updatedAt: true },
      fields: [
        { name: "title", type: "text" },
        { name: "secret", type: "text" },
      ],
    },
    201,
  );
  for (const title of ["Bravo", "Alpha", "Charlie"]) {
    await call(
      "POST",
      `/items/${collection}`,
      { title, secret: "classified" },
      201,
    );
  }
  await call("PUT", `/collections/${collection}/display`, {
    displayField: "secret",
  });
  const permission = await grant(collection, ["title"]);

  async function close() {
    await app.close();
    await db.destroy();
    // The test runner owns and drops this disposable database, including its tables.
  }
  return {
    db,
    app,
    call,
    grant,
    close,
    collection,
    adminToken,
    memberToken,
    outsiderToken,
    admin,
    member,
    outsider,
    ...permission,
  };
}
