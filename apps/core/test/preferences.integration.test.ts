import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import {
  getTablePreferences,
  saveTablePreferences,
} from "../src/preferences/table-preferences.js";
import type { Access } from "../src/permissions/access.js";
import { featureFixture } from "./support/feature-fixture.js";

test("personal preferences isolate users and reconcile schema/grants", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const users = await db("asmblyr_users")
    .insert(
      [true, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const name = `test_preferences_${randomUUID().slice(0, 8)}`;
  const token = (await issueUserTokens(db, users[0].id)).accessToken;
  const other = (await issueUserTokens(db, users[1].id)).accessToken;
  const access: Access = {
    principal: {
      kind: "user",
      id: users[0].id,
      email: "test@example.test",
      superuser: false,
      sessionId: randomUUID(),
    },
    grants: new Map([[`${name}:read`, ["*"]]]),
  };
  async function call(
    method: "GET" | "PATCH" | "POST",
    url: string,
    payload?: object,
    status = 200,
    credential = token,
  ) {
    const res = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${credential}` },
      payload,
    });
    assert.equal(res.statusCode, status, `${url}: ${res.body}`);
    return res.json().data;
  }
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
      201,
    );
    const path = `/users/me/table-preferences/${name}`;
    await call("GET", path, undefined, 403, other);
    const initial = await call("GET", path);
    await Promise.all([
      call("PATCH", path, {
        columns: { order: ["title", "id", "secret"], hidden: ["secret"] },
      }),
      call("PATCH", path, {
        pageSize: 50,
        sort: { field: "title", direction: "desc" },
      }),
    ]);
    const saved = await call("GET", path);
    assert.equal(saved.pageSize, 50);
    assert.equal(saved.columns.order[0], "title");
    assert.equal(saved.sort.direction, "desc");
    await call("PATCH", path, { userId: users[1].id }, 400);
    await call("PATCH", path, { pageSize: 100000 }, 400);
    access.grants = new Map([[`${name}:read`, ["title"]]]);
    const filtered = await getTablePreferences(db, name, access);
    assert.equal(filtered.collectionId, initial.collectionId);
    assert.ok(!filtered.columns?.order.includes("secret"));
    assert.ok(!filtered.columns?.hidden.includes("secret"));
    await assert.rejects(
      saveTablePreferences(db, name, access, {
        columns: { order: ["secret"], hidden: [] },
      }),
      { statusCode: 400 },
    );
    await db.schema.alterTable(name, (t) => t.dropColumn("title"));
    const repaired = await getTablePreferences(db, name, access);
    assert.equal(repaired.sort.field, "id");
    assert.deepEqual(repaired.columns?.order, ["id"]);
    assert.equal(
      (await call("PATCH", "/users/me/preferences", { theme: "dark" })).theme,
      "dark",
    );
    assert.equal(
      (await call("GET", "/users/me/preferences", undefined, 200, other)).theme,
      null,
    );
    await call("PATCH", "/users/me/preferences", { theme: "invalid" }, 400);
  } finally {
    await db("asmblyr_item_events").where({ collection_name: name }).delete();
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db("asmblyr_security_events")
      .whereIn(
        "actor_id",
        users.map((u) => u.id),
      )
      .delete();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((u) => u.id),
      )
      .delete();
    await app.close();
    await db.destroy();
  }
});

test("table filters persist per user and collection, reset explicitly and revalidate revoked fields", async () => {
  const f = await featureFixture();
  const name = `${f.prefix}_filters`;
  const second = `${f.prefix}_other`;
  f.names.push(name, second);
  const { call, memberHeaders } = f;
  try {
    for (const collection of [name, second]) {
      await call(
        "POST",
        "/collections",
        {
          name: collection,
          fields: [
            { name: "title", type: "text" },
            { name: "secret", type: "text" },
          ],
        },
        201,
      );
    }
    const policy = await f.grant(name, "read");
    await f.grant(second, "read");
    const path = `/users/me/table-preferences/${name}`;
    const filter = {
      logic: "and",
      children: [{ field: "title", op: "contains", value: "demo" }],
    };
    assert.equal(
      Object.hasOwn(
        await call("GET", path, undefined, 200, memberHeaders),
        "filter",
      ),
      false,
    );
    await Promise.all([
      call("PATCH", path, { filter }, 200, memberHeaders),
      call(
        "PATCH",
        path,
        {
          columns: {
            order: ["title", "id", "secret"],
            hidden: [],
            widths: { title: 320 },
          },
        },
        200,
        memberHeaders,
      ),
      call(
        "PATCH",
        path,
        { pageSize: 50, sort: { field: "title", direction: "desc" } },
        200,
        memberHeaders,
      ),
    ]);
    const saved = await call("GET", path, undefined, 200, memberHeaders);
    assert.deepEqual(saved.filter, filter);
    assert.equal(saved.pageSize, 50);
    assert.equal(saved.sort.direction, "desc");
    assert.equal(saved.columns.widths.title, 320);
    assert.equal(Object.hasOwn(await call("GET", path), "filter"), false);
    assert.equal(
      Object.hasOwn(
        await call(
          "GET",
          `/users/me/table-preferences/${second}`,
          undefined,
          200,
          memberHeaders,
        ),
        "filter",
      ),
      false,
    );

    await call("PATCH", path, { filter: null }, 200, memberHeaders);
    assert.equal(
      (await call("GET", path, undefined, 200, memberHeaders)).filter,
      null,
    );
    await call("PATCH", path, { pageSize: 100 }, 200, memberHeaders);
    assert.equal(
      (await call("GET", path, undefined, 200, memberHeaders)).filter,
      null,
    );
    await call("PATCH", path, { filter: [] }, 400, memberHeaders);
    await call(
      "PATCH",
      path,
      {
        filter: {
          logic: "and",
          children: [{ field: "missing", op: "eq", value: "x" }],
        },
      },
      400,
      memberHeaders,
    );

    const privateFilter = {
      logic: "and",
      children: [{ field: "secret", op: "eq", value: "private" }],
    };
    await call("PATCH", path, { filter: privateFilter }, 200, memberHeaders);
    await call("DELETE", `/policies/${policy}`, undefined, 204);
    await f.grant(name, "read", ["title"]);
    const restricted = await call("GET", path, undefined, 200, memberHeaders);
    assert.equal(restricted.filter, null);
    assert.ok(!JSON.stringify(restricted).includes("private"));
    await call(
      "PATCH",
      path,
      { filter: privateFilter, pageSize: 10 },
      403,
      memberHeaders,
    );
    assert.equal(
      (await call("GET", path, undefined, 200, memberHeaders)).pageSize,
      100,
    );
    await call("PATCH", path, { filter }, 200, memberHeaders);
    await f.db.schema.alterTable(name, (table) => table.dropColumn("title"));
    assert.equal(
      (await call("GET", path, undefined, 200, memberHeaders)).filter,
      null,
    );
  } finally {
    await f.close();
  }
});
