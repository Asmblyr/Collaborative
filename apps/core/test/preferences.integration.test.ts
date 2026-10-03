import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { getTablePreferences, saveTablePreferences } from "../src/preferences/table-preferences.js";
import type { Access } from "../src/permissions/access.js";

test("personal preferences isolate users and reconcile schema/grants", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const users = await db("asmblyr_users").insert([true, false].map((superuser) => ({ email: `${randomUUID()}@example.test`, superuser }))).returning("id");
  const name = `test_preferences_${randomUUID().slice(0, 8)}`;
  const token = (await issueUserTokens(db, users[0].id)).accessToken;
  const other = (await issueUserTokens(db, users[1].id)).accessToken;
  const access: Access = { principal: { kind: "user", id: users[0].id, email: "test@example.test", superuser: false, sessionId: randomUUID() },
    grants: new Map([[`${name}:read`, ["*"]]]) };
  async function call(method: "GET" | "PATCH" | "POST", url: string, payload?: object, status = 200, credential = token) {
    const res = await app.inject({ method, url, headers: { authorization: `Bearer ${credential}` }, payload });
    assert.equal(res.statusCode, status, `${url}: ${res.body}`); return res.json().data;
  }
  try {
    await call("POST", "/collections", { name, fields: [{ name: "title", type: "text" }, { name: "secret", type: "text" }] }, 201);
    const path = `/users/me/table-preferences/${name}`;
    await call("GET", path, undefined, 403, other);
    const initial = await call("GET", path);
    await Promise.all([
      call("PATCH", path, { columns: { order: ["title", "id", "secret"], hidden: ["secret"] } }),
      call("PATCH", path, { pageSize: 50, sort: { field: "title", direction: "desc" } }),
    ]);
    const saved = await call("GET", path);
    assert.equal(saved.pageSize, 50); assert.equal(saved.columns.order[0], "title"); assert.equal(saved.sort.direction, "desc");
    await call("PATCH", path, { userId: users[1].id }, 400);
    await call("PATCH", path, { pageSize: 100000 }, 400);
    access.grants = new Map([[`${name}:read`, ["title"]]]);
    const filtered = await getTablePreferences(db, name, access);
    assert.equal(filtered.collectionId, initial.collectionId);
    assert.ok(!filtered.columns?.order.includes("secret"));
    assert.ok(!filtered.columns?.hidden.includes("secret"));
    await assert.rejects(saveTablePreferences(db, name, access, { columns: { order: ["secret"], hidden: [] } }), { statusCode: 400 });
    await db.schema.alterTable(name, (t) => t.dropColumn("title"));
    const repaired = await getTablePreferences(db, name, access);
    assert.equal(repaired.sort.field, "id"); assert.deepEqual(repaired.columns?.order, ["id"]);
    assert.equal((await call("PATCH", "/users/me/preferences", { theme: "dark" })).theme, "dark");
    assert.equal((await call("GET", "/users/me/preferences", undefined, 200, other)).theme, null);
    await call("PATCH", "/users/me/preferences", { theme: "invalid" }, 400);
  } finally {
    await db("asmblyr_item_events").where({ collection_name: name }).delete();
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db("asmblyr_security_events").whereIn("actor_id", users.map((u) => u.id)).delete();
    await db("asmblyr_users").whereIn("id", users.map((u) => u.id)).delete();
    await app.close(); await db.destroy();
  }
});
