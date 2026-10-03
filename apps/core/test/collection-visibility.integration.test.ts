import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { findCollectionSettings } from "../src/collections/settings-repository.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import type { Access } from "../src/permissions/access.js";

test("hidden collections stay usable through relations and API but disappear from global search; visibility is independent of MCP", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const admin = await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const parents = `test_visible_${suffix}`,
    children = `test_hidden_${suffix}`,
    links = `test_hidden_links_${suffix}`;
  const ordinaryId = randomUUID();
  const access: Access = {
    principal: { id: admin.id, kind: "user", superuser: true },
    grants: new Map(),
  };
  async function call(
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: object,
    status = 200,
  ) {
    const result = await app.inject({ method, url, payload });
    assert.equal(result.statusCode, status, result.body);
    return result.json();
  }
  try {
    const visible = await call(
      "POST",
      "/collections",
      { name: parents, fields: [{ name: "title", type: "text" }] },
      201,
    );
    assert.equal(visible.data.hidden, false);
    const hidden = await call(
      "POST",
      "/collections",
      {
        name: children,
        hidden: true,
        displayName: `Hidden ${suffix}`,
        fields: [{ name: "title", type: "text" }],
      },
      201,
    );
    assert.equal(hidden.data.hidden, true);
    assert.deepEqual(hidden.data.mcp, { enabled: true, description: null });
    await call(
      "POST",
      `/collections/${parents}/relations`,
      {
        kind: "m2m",
        name: "children",
        targetCollection: children,
        junctionCollection: links,
        sourceKey: "parent_id",
        targetKey: "child_id",
      },
      201,
    );
    await call("PATCH", `/collections/${links}/settings`, { hidden: true });
    const parent = (
      await call(
        "POST",
        `/items/${parents}`,
        { title: `Visible ${suffix}` },
        201,
      )
    ).data.id;
    const child = (
      await call(
        "POST",
        `/items/${children}`,
        { title: `Hidden ${suffix}` },
        201,
      )
    ).data.id;
    const path = `/items/${parents}/${parent}/relations/children`;
    const candidates = await call("GET", `${path}/candidates`);
    assert.equal(candidates.data[0].id, child);
    await call("POST", `${path}/links/to/${child}`, {}, 201);
    const related = await call("GET", path);
    assert.equal(related.data[0].id, child);
    assert.equal(related.data[0].label, `Hidden ${suffix}`);
    assert.equal(
      (await call("GET", `/items/${children}/${child}`)).data.title,
      `Hidden ${suffix}`,
    );
    const catalog = (await call("GET", "/collections")).data;
    assert.equal(
      catalog.find((c: { name: string }) => c.name === children).hidden,
      true,
    );
    assert.equal(
      catalog.find((c: { name: string }) => c.name === links).hidden,
      true,
    );

    let results = await call("GET", `/search?q=${suffix}`);
    assert.ok(
      results.collections.some((c: { name: string }) => c.name === parents),
    );
    assert.ok(
      !results.collections.some((c: { name: string }) =>
        [children, links].includes(c.name),
      ),
    );
    assert.ok(
      results.items.some(
        (item: { collection: string }) => item.collection === parents,
      ),
    );
    assert.ok(
      !results.items.some((item: { collection: string }) =>
        [children, links].includes(item.collection),
      ),
    );
    await call("PATCH", `/collections/${children}/settings`, {
      displayName: `Renamed ${suffix}`,
    });
    assert.equal((await findCollectionSettings(db, children))?.hidden, true);

    const tools = (await createContextTools(
      db,
      access,
      {
        page: "items",
        workspaceId: null,
        collection: children,
        table: {
          page: 1,
          size: 25,
          sort: "id",
          direction: "asc",
          q: "",
          filter: "",
          selectedCount: 0,
          editorOpen: false,
        },
      },
      async () => access,
    ))!;
    assert.ok(tools.definitions.length > 0);
    assert.ok(!("error" in (await tools.execute("describe_collection", {}))));
    assert.ok(
      !(
        "error" in
        (await tools.execute("read_item", { id: child, fields: ["title"] }))
      ),
    );
    for (const invalid of [null, "true", 1, {}]) {
      await call(
        "PATCH",
        `/collections/${children}/settings`,
        { hidden: invalid },
        400,
      );
      await call(
        "POST",
        "/collections",
        { name: `test_bad_${suffix}`, hidden: invalid },
        400,
      );
    }
    await call(
      "PATCH",
      "/collections/asmblyr_users/settings",
      { hidden: true },
      403,
    );
    await db("asmblyr_users").insert({
      id: ordinaryId,
      email: `${ordinaryId}@example.test`,
      superuser: false,
    });
    const token = (await issueUserTokens(db, ordinaryId)).accessToken;
    const denied = await app.inject({
      method: "PATCH",
      url: `/collections/${children}/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hidden: false },
    });
    assert.equal(denied.statusCode, 403);
    await call("PATCH", `/collections/${children}/settings`, { hidden: false });
    assert.equal((await findCollectionSettings(db, children))?.hidden, false);
    results = await call("GET", `/search?q=${suffix}`);
    assert.ok(
      results.collections.some((c: { name: string }) => c.name === children),
    );
    assert.ok(
      results.items.some(
        (item: { collection: string }) => item.collection === children,
      ),
    );
  } finally {
    for (const name of [links, children, parents]) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await db("asmblyr_users").where({ id: ordinaryId }).delete();
    await app.close();
    await db.destroy();
  }
});
