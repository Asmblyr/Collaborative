import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { createContextTools, validateFilterProposal } from "../src/assistant/context-tools.js";
import { executeDataTool } from "../src/tools/data-tools.js";
import { findCollectionSettings } from "../src/collections/settings-repository.js";
import type { Access } from "../src/permissions/access.js";
import type { AssistantContext } from "../src/assistant/context-input.js";

test("collection metadata persists atomically; MCP limits discovery, reads and relation queries independently of API grants", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const admin = await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const posts = `test_mcp_posts_${suffix}`,
    people = `test_mcp_people_${suffix}`,
    links = `test_mcp_links_${suffix}`;
  const ordinaryId = randomUUID();
  const access: Access = {
    principal: { id: admin.id, kind: "user", superuser: true },
    grants: new Map(),
  };
  const context: AssistantContext = {
    page: "items",
    workspaceId: null,
    collection: posts,
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
  };
  const toolsFor = (collection = posts) =>
    createContextTools(db, access, { ...context, collection }, async () => access);
  const settings = (name: string, payload: object) =>
    app.inject({ method: "PATCH", url: `/collections/${name}/settings`, payload });
  const condition = (field: string) => ({
    logic: "and",
    children: [{ field, op: "eq", value: "Needle" }],
  });
  const asJson = (value: object) => JSON.parse(JSON.stringify(value));
  try {
    for (const name of [people, posts]) {
      const created = await app.inject({
        method: "POST",
        url: "/collections",
        payload: {
          name,
          primaryKey: { name: "id", type: "serial" },
          fields: [{ name: "title", type: "text" }],
          ...(name === posts
            ? {
                displayName: "  Публикации  ",
                mcp: { enabled: true, description: "  Published content  " },
              }
            : {}),
        },
      });
      assert.equal(created.statusCode, 201, created.body);
      assert.equal(created.json().data.displayName, name === posts ? "Публикации" : null);
      assert.deepEqual(created.json().data.mcp, {
        enabled: true,
        description: name === posts ? "Published content" : null,
      });
    }
    for (const payload of [
      { name: "author_id", targetCollection: people, reverseField: "posts" },
      {
        kind: "m2m",
        name: "authors",
        targetCollection: people,
        junctionCollection: links,
        sourceKey: "post_id",
        targetKey: "author_id",
      },
    ]) {
      const result = await app.inject({
        method: "POST",
        url: `/collections/${posts}/relations`,
        payload,
      });
      assert.equal(result.statusCode, 201, result.body);
    }
    await app.inject({
      method: "PUT",
      url: `/collections/${posts}/relations/author_id/search`,
      payload: { searchable: true },
    });
    await app.inject({
      method: "PUT",
      url: `/collections/${posts}/relations/authors/search`,
      payload: { searchable: true },
    });
    await db(people).insert({ id: 1, title: "Needle" });
    await db(posts).insert({ id: 1, title: "Alpha", author_id: 1 });
    await db(links).insert({ post_id: 1, author_id: 1 });
    const tools = (await toolsFor())!;
    const described = asJson(await tools.execute("describe_collection", {}));
    assert.equal(described.displayName, "Публикации");
    assert.equal(asJson(tools.context).displayName, "Публикации");
    assert.equal(described.description, "Published content");
    assert.ok(described.filterPaths.some((f: { path: string }) => f.path === "authors.title"));
    assert.equal(
      asJson(await tools.execute("count_items", { q: "Needle", filter: "" })).count,
      "1",
    );

    const renamed = await settings(posts, {
      displayName: "Материалы",
      displayField: "title",
      displayTemplate: "{{title}}",
      mcp: { enabled: true, description: "Editorial data" },
    });
    assert.equal(renamed.statusCode, 200, renamed.body);
    assert.equal(renamed.json().data.name, posts);
    assert.equal(renamed.json().data.displayName, "Материалы");
    assert.equal((await findCollectionSettings(db, posts))?.mcp?.description, "Editorial data");
    const counted = asJson(await tools.execute("count_items", { q: "", filter: "" }));
    assert.equal(counted.displayName, "Материалы");
    assert.equal(counted.collection, posts);
    const read = asJson(await tools.execute("read_item", { id: "1", fields: ["title"] }));
    assert.equal(read.displayName, "Материалы");
    await tools.execute("propose_filter", { filter: JSON.stringify(condition("title")) });
    assert.equal(tools.proposals[0].collectionDisplayName, "Материалы");
    assert.equal(tools.proposals[0].collection, posts);
    for (const payload of [
      { displayName: 1 },
      { displayName: "x".repeat(121) },
      { displayName: "bad\0name" },
      { mcp: null },
      { mcp: { enabled: "false" } },
      { mcp: { enabled: true, description: "x".repeat(2001) } },
      { name: "renamed" },
      {},
      { displayName: "Must roll back", displayField: "missing" },
    ]) {
      const bad = await settings(posts, payload);
      assert.equal(bad.statusCode, 400, bad.body);
    }
    assert.equal((await findCollectionSettings(db, posts))?.displayName, "Материалы");
    assert.equal((await settings("asmblyr_users", { displayName: "Users" })).statusCode, 403);
    assert.equal((await settings(`absent_${suffix}`, { displayName: "Missing" })).statusCode, 404);
    const catalog = (await app.inject({ method: "GET", url: "/collections" })).json().data;
    assert.equal(catalog.find((c: { name: string }) => c.name === posts).displayName, "Материалы");
    const found = await app.inject({
      method: "GET",
      url: `/search?q=${encodeURIComponent("Материалы")}`,
    });
    assert.equal(found.statusCode, 200, found.body);
    assert.ok(JSON.stringify(found.json()).includes(posts));

    await db("asmblyr_users").insert({
      id: ordinaryId,
      email: `${ordinaryId}@example.test`,
      superuser: false,
    });
    const token = (await issueUserTokens(db, ordinaryId)).accessToken;
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/collections/${posts}/settings`,
          headers: { authorization: `Bearer ${token}` },
          payload: { mcp: { enabled: false } },
        })
      ).statusCode,
      403,
    );

    // A disabled junction must prevent traversing an otherwise enabled target.
    assert.equal((await settings(links, { mcp: { enabled: false } })).statusCode, 200);
    let fresh = (await toolsFor())!;
    let schema = JSON.stringify(await fresh.execute("describe_collection", {}));
    assert.ok(!schema.includes("authors.title"));
    assert.ok(schema.includes("author_id.title"));
    assert.ok(
      "error" in
        (await fresh.execute("count_items", {
          q: "",
          filter: JSON.stringify(condition("authors.title")),
        })),
    );
    await settings(links, { mcp: { enabled: true } });
    // Disable the target: no one-hop schema, filters, search or proposals.
    await settings(people, { mcp: { enabled: false, description: "Hidden collection" } });
    fresh = (await toolsFor())!;
    schema = JSON.stringify(await fresh.execute("describe_collection", {}));
    assert.ok(!schema.includes("author_id.title"));
    assert.ok(!schema.includes("authors.title"));
    assert.equal(
      asJson(await fresh.execute("count_items", { q: "Needle", filter: "" })).count,
      "0",
    );
    for (const path of ["author_id.title", "authors.title"]) {
      assert.ok(
        "error" in
          (await fresh.execute("count_items", { q: "", filter: JSON.stringify(condition(path)) })),
      );
      assert.ok(
        "error" in
          (await fresh.execute("propose_filter", { filter: JSON.stringify(condition(path)) })),
      );
    }
    const disabled = (await toolsFor(people))!;
    assert.equal(disabled.definitions.length, 0);
    assert.ok(!JSON.stringify(disabled.context).includes(people));
    assert.ok("error" in (await disabled.execute("read_item", { id: "1", fields: ["title"] })));
    // Current collection disabled after tools were issued: even superuser is blocked.
    const id = (await findCollectionSettings(db, posts))!.internalId;
    await settings(posts, { mcp: { enabled: false } });
    for (const [tool, args] of [
      ["read_item", { id: "1", fields: ["title"] }],
      ["count_items", { q: "", filter: "" }],
      ["describe_collection", {}],
    ] as const) {
      assert.ok("error" in (await tools.execute(tool, args)));
    }
    await assert.rejects(
      executeDataTool(db, access, posts, id, "read_item", { id: "1", fields: ["title"] }),
      { statusCode: 403 },
    );
    await assert.rejects(
      validateFilterProposal(db, access, { context, collectionId: id, filter: condition("title") }),
      { statusCode: 403 },
    );
    await settings(people, { mcp: { enabled: true } });
    const reverse = (await toolsFor(people))!;
    assert.ok(
      !JSON.stringify(await reverse.execute("describe_collection", {})).includes("posts.title"),
    );
    assert.ok(
      "error" in
        (await reverse.execute("count_items", {
          q: "",
          filter: JSON.stringify(condition("posts.title")),
        })),
    );
    const normalApi = await app.inject({ method: "GET", url: `/items/${posts}/1` });
    assert.equal(normalApi.statusCode, 200, normalApi.body);
    assert.equal(normalApi.json().data.title, "Alpha");
    await settings(posts, { displayName: "  ", mcp: { enabled: true, description: "" } });
    assert.equal((await findCollectionSettings(db, posts))?.displayName, null);
    fresh = (await toolsFor())!;
    await fresh.execute("describe_collection", {});
    assert.equal(
      asJson(await fresh.execute("read_item", { id: "1", fields: ["title"] })).item.values.title,
      "Alpha",
    );
  } finally {
    for (const name of [links, posts, people]) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await db("asmblyr_users").where({ id: ordinaryId }).delete();
    await app.close();
    await db.destroy();
  }
});
