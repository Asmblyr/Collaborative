import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import type { Access } from "../src/permissions/access.js";
import type { AssistantContext } from "../src/assistant/context-input.js";
import { listItems } from "../src/items/service.js";

function page(collection: string): AssistantContext {
  return {
    page: "items",
    workspaceId: null,
    collection,
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
}
const search = {
  q: null,
  filter: null,
  fields: ["title"],
  limit: 5,
  page: 1,
  sort: null,
  direction: null,
};
const condition = (field: string, value: string) =>
  JSON.stringify({ logic: "and", children: [{ field, op: "eq", value }] });
function json(value: object) {
  return JSON.parse(JSON.stringify(value));
}

test("assistant data tools share query semantics, enforce projections and relation grants, bound previews and refresh access", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const posts = `test_ai_data_${suffix}`,
    authors = `test_ai_people_${suffix}`;
  const access: Access = {
    principal: { id: randomUUID(), kind: "user", superuser: false },
    grants: new Map([
      [`${posts}:read`, ["title", "body", "metadata", "author_id"]],
      [`${authors}:read`, ["title", "posts"]],
    ]),
  };
  const reload = async () => access;
  try {
    for (const name of [authors, posts]) {
      const created = await app.inject({
        method: "POST",
        url: "/collections",
        payload: {
          name,
          primaryKey: { name: "id", type: "serial" },
          fields: [
            { name: "title", type: "text" },
            { name: "secret", type: "text" },
            { name: "body", type: "text" },
            { name: "metadata", type: "json" },
          ],
        },
      });
      assert.equal(created.statusCode, 201, created.body);
    }
    const related = await app.inject({
      method: "POST",
      url: `/collections/${posts}/relations`,
      payload: {
        name: "author_id",
        targetCollection: authors,
        reverseField: "posts",
      },
    });
    assert.equal(related.statusCode, 201, related.body);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/collections/${posts}/relations/author_id/search`,
          payload: { searchable: true },
        })
      ).statusCode,
      200,
    );
    const [author] = await db(authors)
      .insert({ title: "Ada", secret: "hidden-target" })
      .returning("id");
    await db(posts).insert(
      Array.from({ length: 23 }, (_, i) => ({
        title: i < 3 ? "Alpha" : "Beta",
        secret: "hidden-source",
        body: i === 0 ? "x".repeat(50000) : null,
        metadata: i === 0 ? JSON.stringify({ large: "m".repeat(50000) }) : null,
        author_id: i < 3 ? author.id : null,
      })),
    );
    const context = page(posts);
    assert.equal(await createContextTools(db, access, null, reload), undefined);
    const fromSettings = (await createContextTools(
      db,
      access,
      { page: "settings", workspaceId: null },
      reload,
    ))!;
    assert.equal(fromSettings.definitions.length, 8);
    await fromSettings.close?.();
    const tools = (await createContextTools(db, access, context, reload))!;
    assert.ok("error" in (await tools.execute("search_items", search)));
    await tools.execute("describe_collection", {});

    const result = json(await tools.execute("search_items", search));
    assert.equal(result.items.length, 5);
    assert.equal(result.hasMore, true);
    assert.deepEqual(result.items[0], {
      values: { id: "1", title: "Alpha" },
      truncatedFields: [],
    });
    assert.ok(!JSON.stringify(result).includes("hidden-source"));
    const next = json(
      await tools.execute("search_items", { ...search, page: 2 }),
    );
    assert.equal(next.items[0].values.id, "6");
    assert.equal(
      json(await tools.execute("search_items", { ...search, page: 5 })).hasMore,
      false,
    );
    assert.equal(
      json(await tools.execute("count_items", { q: null, filter: null })).count,
      "23",
    );

    for (const [q, filter, expected] of [
      ["Alpha", "", "3"],
      ["Ada", "", "3"],
      ["", condition("author_id.title", "Ada"), "3"],
      ["hidden-source", "", "0"],
      ["hidden-target", "", "0"],
    ]) {
      const counted = json(await tools.execute("count_items", { q, filter }));
      const api = await listItems(
        db,
        posts,
        access.grants.get(`${posts}:read`)!,
        { q, filter: filter || undefined },
        access,
      );
      assert.equal(counted.count, expected);
      assert.equal(counted.count, api.page.total);
      assert.equal(
        json(await tools.execute("search_items", { ...search, q, filter }))
          .items.length,
        Number(expected),
      );
    }
    const scoped = (await createContextTools(
      db,
      access,
      { ...context, table: { ...context.table!, q: "Alpha" } },
      reload,
    ))!;
    await scoped.execute("describe_collection", {});
    assert.equal(
      json(await scoped.execute("count_items", { q: null, filter: null }))
        .count,
      "3",
    );
    assert.equal(
      json(await scoped.execute("count_items", { q: "", filter: "" })).count,
      "23",
    );
    assert.equal(
      json(await scoped.execute("read_item", { id: "23", fields: ["title"] }))
        .item.values.title,
      "Beta",
    );

    const read = json(
      await tools.execute("read_item", {
        id: "1",
        fields: ["title", "body", "metadata"],
      }),
    );
    assert.equal(read.item.values.body.length, 2000);
    assert.deepEqual(read.item.truncatedFields, ["body", "metadata"]);
    assert.equal(
      json(await tools.execute("read_item", { id: "2", fields: ["body"] })).item
        .values.body,
      null,
    );
    assert.equal(
      json(await tools.execute("read_item", { id: "99999", fields: ["title"] }))
        .found,
      false,
    );
    assert.equal(
      json(await tools.execute("search_items", { ...search, limit: 20 })).items
        .length,
      20,
    );

    for (const args of [
      { ...search, fields: ["secret"] },
      { ...search, fields: ["*"] },
      { ...search, sort: "secret" },
      { ...search, fields: ["author_id.title"] },
      { ...search, fields: [] },
      { ...search, fields: ["title", "title"] },
      { ...search, limit: 21 },
      { ...search, page: 51 },
      { ...search, limit: "5" },
      { ...search, collection: authors },
      { ...search, filter: condition("secret", "hidden-source") },
      { ...search, filter: condition("author_id.secret", "hidden-target") },
    ]) {
      const error = await tools.execute("search_items", args);
      assert.ok("error" in error, JSON.stringify(args));
      assert.ok(
        !/hidden-source|hidden-target|select |secret|postgres/i.test(
          JSON.stringify(error),
        ),
      );
    }
    assert.ok(
      "error" in
        (await tools.execute("read_item", { id: "1", fields: ["secret"] })),
    );
    assert.ok(
      "error" in
        (await tools.execute("read_item", {
          id: "1 OR 1=1",
          fields: ["title"],
        })),
    );
    assert.ok(
      "error" in
        (await tools.execute("count_items", {
          q: "",
          filter: condition("secret", "hidden-source"),
        })),
    );

    // Count is a scalar aggregate, never a row read disguised as list+count.
    const queries: string[] = [];
    const capture = (event: { sql: string }) => {
      queries.push(event.sql);
    };
    db.on("query", capture);
    await tools.execute("count_items", { q: "", filter: "" });
    db.off("query", capture);
    const reads = queries.filter((sql) =>
      sql.includes(`from "public"."${posts}"`),
    );
    assert.equal(reads.length, 1);
    assert.match(reads[0], /count\(\*\)/);

    access.grants.delete(`${authors}:read`);
    assert.ok(
      "error" in
        (await tools.execute("count_items", {
          q: "",
          filter: condition("author_id.title", "Ada"),
        })),
    );
    assert.equal(
      json(await tools.execute("count_items", { q: "Ada", filter: "" })).count,
      "0",
    );
    access.grants.set(`${posts}:read`, ["title"]);
    assert.ok(
      "error" in
        (await tools.execute("read_item", { id: "1", fields: ["body"] })),
    );
    const cancelled = new AbortController();
    cancelled.abort();
    assert.ok(
      "error" in
        (await tools.execute(
          "count_items",
          { q: "", filter: "" },
          cancelled.signal,
        )),
    );

    // Bound lock waits too, then ensure transaction-local timeout did not poison the pool.
    const lock = await db.transaction();
    try {
      await lock.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [
        `public.${posts}`,
      ]);
      assert.ok(
        "error" in (await tools.execute("count_items", { q: "", filter: "" })),
      );
    } finally {
      await lock.rollback();
    }
    assert.equal(
      json(await tools.execute("count_items", { q: "", filter: "" })).count,
      "23",
    );
    access.grants.delete(`${posts}:read`);
    for (const tool of [
      "describe_collection",
      "search_items",
      "read_item",
      "count_items",
    ]) {
      assert.ok(
        "error" in
          (await tools.execute(
            tool,
            tool === "search_items"
              ? search
              : { id: "1", fields: ["title"], q: "", filter: "" },
          )),
      );
    }
  } finally {
    for (const name of [posts, authors]) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await app.close();
    await db.destroy();
  }
});

test("assistant preserves text/UUID/bigint keys and refuses a recreated collection", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, db);
  const name = `test_ai_keys_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const access: Access = {
    principal: { id: randomUUID(), kind: "user", superuser: true },
    grants: new Map(),
  };
  const remove = async () => {
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
  };
  try {
    for (const [type, id] of [
      ["text", "key".repeat(85)],
      ["uuid", randomUUID()],
      ["bigserial", "9223372036854775806"],
    ]) {
      const payload = {
        name,
        primaryKey: { name: "id", type },
        fields: [{ name: "title", type: "text" }],
      };
      assert.equal(
        (await app.inject({ method: "POST", url: "/collections", payload }))
          .statusCode,
        201,
      );
      await db(name).insert({ id, title: "Key fixture" });
      const tools = (await createContextTools(
        db,
        access,
        page(name),
        async () => access,
      ))!;
      await tools.execute("describe_collection", {});
      assert.equal(
        json(await tools.execute("read_item", { id, fields: ["title"] })).item
          .values.id,
        id,
      );
      assert.equal(
        json(await tools.execute("search_items", search)).items[0].values.id,
        id,
      );
      await remove();
      assert.equal(
        (await app.inject({ method: "POST", url: "/collections", payload }))
          .statusCode,
        201,
      );
      await db(name).insert({ id, title: "New collection must not leak" });
      assert.ok(
        "error" in
          (await tools.execute("read_item", { id, fields: ["title"] })),
      );
      assert.ok(
        "error" in (await tools.execute("count_items", { q: "", filter: "" })),
      );
      await remove();
    }
  } finally {
    await remove();
    await app.close();
    await db.destroy();
  }
});
