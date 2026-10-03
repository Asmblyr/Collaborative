import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("virtual collection trees preserve data, ordering and access, reject concurrent cycles and promote children on deletion", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, db);
  const prefix = `test_nav_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const [parent, a, b, leaf, peer, x, y, invalid] = ["parent", "a", "b", "leaf", "peer", "x", "y", "invalid"].map((s) => `${prefix}_${s}`);
  const names = [parent, a, b, leaf, peer, x, y, invalid];
  let folderId: string | undefined, policyId: string | undefined;
  const viewerId = randomUUID();
  async function call(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object, status = 200) {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, status, response.body);
    return status === 204 ? null : response.json();
  }
  async function catalog() { return (await call("GET", "/collections")).data as { name: string; folderId: string | null; parentCollection: string | null }[]; }
  async function children(name: string) { return (await catalog()).filter((c) => c.parentCollection === name).map((c) => c.name); }
  const move = (name: string, parentCollection: string | null, before?: string | null, status = 200) =>
    call("PATCH", `/collections/${name}/navigation`, { parentCollection, before }, status);
  try {
    folderId = (await call("POST", "/folders", { name: prefix }, 201)).data.id;
    await call("POST", "/collections", { name: parent, folderId }, 201);
    await call("POST", "/collections", { name: peer, folderId }, 201);
    for (const name of [a, b]) await call("POST", "/collections", { name, parentCollection: parent }, 201);
    await call("POST", "/collections", { name: leaf, parentCollection: a }, 201);
    const itemId = (await call("POST", `/items/${leaf}`, {}, 201)).data.id;
    assert.deepEqual(await children(parent), [a, b]);
    assert.equal((await catalog()).find((c) => c.name === leaf)?.folderId, null);
    await move(b, parent, a);
    assert.deepEqual(await children(parent), [b, a]);
    await move(a, a, undefined, 400);
    await move(parent, leaf, undefined, 400);
    await move(a, parent, leaf, 400);
    await move(a, `${prefix}_missing`, undefined, 404);
    await call("PATCH", `/collections/${a}/navigation`, { folderId, parentCollection: parent }, 400);
    await call("POST", "/collections", { name: invalid, folderId, parentCollection: parent }, 400);
    await call("POST", "/collections", { name: invalid, parentCollection: `${prefix}_missing` }, 404);
    assert.equal(await db.schema.hasTable(invalid), false);
    await call("PATCH", "/collections/asmblyr_users/navigation", { parentCollection: parent }, 403);

    // Navigation parentage grants no access to either side.
    await db("asmblyr_users").insert({ id: viewerId, email: `${viewerId}@example.test`, superuser: false });
    policyId = (await call("POST", "/policies", { name: prefix }, 201)).data.id;
    const permissionId = (await call("POST", "/permissions", { collection: leaf, action: "read", fields: ["*"] }, 201)).data.id;
    await call("PUT", `/policies/${policyId}/permissions/${permissionId}`, undefined, 204);
    await call("PUT", `/policies/${policyId}/users/${viewerId}`, undefined, 204);
    const headers = { authorization: `Bearer ${(await issueUserTokens(db, viewerId)).accessToken}` };
    const visible = (await app.inject({ method: "GET", url: "/collections", headers })).json().data;
    assert.deepEqual(visible.map((c: { name: string }) => c.name), [leaf]);
    assert.equal(visible[0].parentCollection, null);
    assert.equal((await app.inject({ method: "GET", url: `/items/${parent}`, headers })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: `/items/${leaf}/${itemId}`, headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "PATCH", url: `/collections/${leaf}/navigation`, headers, payload: { parentCollection: null } })).statusCode, 403);

    // Moving a subtree does not rewrite its descendants or data.
    await call("PATCH", `/collections/${parent}/folder`, { folderId: null });
    assert.deepEqual(await children(parent), [b, a]);
    assert.deepEqual(await children(a), [leaf]);
    await call("PATCH", `/collections/${parent}/navigation`, { folderId, before: peer });
    await call("DELETE", `/collections/${parent}`, undefined, 204);
    const afterDelete = (await catalog()).filter((c) => c.folderId === folderId);
    assert.deepEqual(afterDelete.map((c) => c.name), [b, a, peer]);
    assert.equal(afterDelete.find((c) => c.name === a)?.parentCollection, null);
    assert.deepEqual(await children(a), [leaf]);
    assert.equal((await call("GET", `/items/${leaf}/${itemId}`)).data.id, itemId);
    await call("DELETE", `/folders/${folderId}`, undefined, 204);
    folderId = undefined;
    assert.equal((await catalog()).find((c) => c.name === a)?.folderId, null);
    assert.deepEqual(await children(a), [leaf]);

    for (const name of [x, y]) await call("POST", "/collections", { name }, 201);
    const concurrent = await Promise.all([
      app.inject({ method: "PATCH", url: `/collections/${x}/navigation`, payload: { parentCollection: y } }),
      app.inject({ method: "PATCH", url: `/collections/${y}/navigation`, payload: { parentCollection: x } }),
    ]);
    assert.deepEqual(concurrent.map((r) => r.statusCode).sort(), [200, 400]);
    await move(x, null); await move(y, null);
  } finally {
    for (const name of names) {
      await db.schema.withSchema("public").dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    if (folderId) await db("asmblyr_collection_folders").where({ id: folderId }).delete();
    if (policyId) await db("asmblyr_policies").where({ id: policyId }).delete();
    await db("asmblyr_users").where({ id: viewerId }).delete();
    await app.close(); await db.destroy();
  }
});
