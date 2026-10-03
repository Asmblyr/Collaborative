import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("item filters combine with search and pagination without exposing hidden fields", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const authors = `test_filter_authors_${suffix}`;
  const posts = `test_filter_posts_${suffix}`;
  const tags = `test_filter_tags_${suffix}`;
  const junction = `test_filter_post_tags_${suffix}`;
  let readerId: string | undefined;
  let policyId: string | undefined;
  const condition = (field: string, op: string, value?: string) =>
    ({ field, op, ...(value === undefined ? {} : { value }) });
  const get = (filters: object | object[], extra = "", headers?: Record<string, string>,
    collection = posts) =>
    app.inject({ method: "GET",
      url: `/items/${collection}?filter=${encodeURIComponent(JSON.stringify(filters))}${extra}`, headers });

  try {
    assert.equal((await app.inject({ method: "POST", url: "/collections", payload: {
      name: authors, primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "name", type: "text" }, { name: "secret", type: "text" }],
    } })).statusCode, 201);
    assert.equal((await app.inject({ method: "POST", url: "/collections", payload: {
      name: posts, primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "title", type: "text" }, { name: "score", type: "integer" },
        { name: "published", type: "boolean" }, { name: "issued_at", type: "datetime" },
        { name: "note", type: "text" }],
    } })).statusCode, 201);
    const relation = await app.inject({ method: "POST", url: `/collections/${posts}/relations`,
      payload: { name: "author_id", targetCollection: authors, reverseField: "posts" } });
    assert.equal(relation.statusCode, 201, relation.body);
    const authorIds: number[] = [];
    for (const name of ["Ada", "Bea"]) {
      const result = await app.inject({ method: "POST", url: `/items/${authors}`, payload: { name } });
      assert.equal(result.statusCode, 201, result.body);
      authorIds.push(result.json().data.id as number);
    }
    const rows = [
      { title: "Alpha %", score: 10, published: true,
        issued_at: "2026-01-01T12:00:00Z", note: null, author_id: authorIds[0] },
      { title: "Alpha beta", score: 20, published: false,
        issued_at: "2026-02-01T12:00:00Z", note: "hello", author_id: authorIds[0] },
      { title: "Other", score: 30, published: true,
        issued_at: "2026-03-01T12:00:00Z", note: null, author_id: authorIds[1] },
    ];
    for (const row of rows) {
      const created = await app.inject({ method: "POST", url: `/items/${posts}`, payload: row });
      assert.equal(created.statusCode, 201, created.body);
    }

    const alpha = [condition("title", "contains", "Alpha")];
    const first = await get(alpha, "&limit=1&page=1");
    const second = await get(alpha, "&limit=1&page=2");
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().page.total, "2");
    assert.equal(second.json().page.total, "2");
    assert.notEqual(first.json().data[0].id, second.json().data[0].id);
    assert.equal((await get([condition("title", "contains", "%")])).json().page.total, "1");
    assert.equal((await get({ logic: "and", children: [
      condition("title", "containsCase", "alpha"),
    ] })).json().page.total, "0");
    assert.equal((await get({ logic: "and", children: [
      condition("title", "contains", "alpha"),
    ] })).json().page.total, "2");
    assert.equal((await get([condition("score", "gte", "20"),
      condition("score", "lt", "30")])).json().data[0].title, "Alpha beta");
    assert.equal((await get([condition("published", "eq", "true")])).json().page.total, "2");
    assert.equal((await get([condition("issued_at", "gte", "2026-02-01T00:00:00Z")])).json().page.total, "2");
    assert.equal((await get([condition("note", "isNull")])).json().page.total, "2");
    assert.equal((await get([condition("note", "notNull")])).json().page.total, "1");
    assert.equal((await get([condition("author_id", "eq", String(authorIds[0]))])).json().page.total, "2");
    assert.equal((await get({ logic: "or", children: [
      { logic: "and", children: [condition("score", "gte", "20"),
        condition("score", "lt", "30")] }, condition("title", "eq", "Other"),
    ] })).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      condition("author_id.name", "eq", "Ada"),
      { field: "title", op: "notContains", value: "beta" },
    ] })).json().page.total, "1");
    assert.equal((await get({ logic: "and", children: [
      { field: "posts.title", op: "contains", value: "Alpha", quantifier: "some" },
    ] }, "", undefined, authors)).json().page.total, "1");
    assert.equal((await get({ logic: "and", children: [
      { field: "posts.title", op: "contains", value: "Alpha", quantifier: "none" },
    ] }, "", undefined, authors)).json().page.total, "1");
    assert.equal((await get({ logic: "and", children: [
      { field: "score", op: "between", value: ["10", "20"] },
      { field: "title", op: "startsWith", value: "Al" },
    ] })).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      { field: "score", op: "in", value: ["10", "30"] },
    ] })).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      { field: "author_id.name.secret", op: "eq", value: "x" },
    ] })).statusCode, 400);
    assert.equal((await get({ logic: "or", children: [
      { logic: "and", children: [] },
    ] })).statusCode, 400);
    assert.equal((await get({ logic: "and", children: [
      { field: "score", op: "in", value: [] },
    ] })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/collections", payload: {
      name: tags, primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "label", type: "text" }],
    } })).statusCode, 201);
    const m2m = await app.inject({ method: "POST", url: `/collections/${posts}/relations`,
      payload: { kind: "m2m", name: "tags", targetCollection: tags,
        junctionCollection: junction, sourceKey: "post_id", targetKey: "tag_id" } });
    assert.equal(m2m.statusCode, 201, m2m.body);
    const [tag] = await database(tags).withSchema("public").insert({ label: "news" }).returning("id");
    const [post] = await database(posts).withSchema("public").where({ title: "Alpha %" }).select("id");
    await database(junction).withSchema("public").insert({ post_id: post.id, tag_id: tag.id });
    assert.equal((await get({ logic: "and", children: [
      { field: "tags.label", op: "eq", value: "news", quantifier: "some" },
    ] })).json().page.total, "1");
    assert.equal((await get({ logic: "and", children: [
      { field: "tags.label", op: "eq", value: "news", quantifier: "none" },
    ] })).json().page.total, "2");
    assert.equal((await get([condition("author_id.id", "exists")])).json().page.total, "3");
    assert.equal((await get([condition("author_id.id", "notExists")])).json().page.total, "0");
    assert.equal((await get([condition("tags.id", "exists")])).json().page.total, "1");
    assert.equal((await get([condition("tags.id", "notExists")])).json().page.total, "2");
    const unassigned = await app.inject({ method: "POST", url: `/items/${authors}`,
      payload: { name: "No posts" } });
    assert.equal(unassigned.statusCode, 201, unassigned.body);
    assert.equal((await get([condition("posts.id", "exists")], "", undefined, authors))
      .json().page.total, "2");
    assert.equal((await get([condition("posts.id", "notExists")], "", undefined, authors))
      .json().page.total, "1");
    assert.equal((await get([condition("title", "exists")])).statusCode, 400);
    assert.equal((await get([condition("tags.label", "exists")])).statusCode, 400);
    assert.equal((await get([{ field: "tags.id", op: "exists", value: "1" }])).statusCode, 400);
    assert.equal((await get([{ field: "tags.id", op: "exists", quantifier: "none" }])).statusCode, 400);
    assert.equal((await get([condition("score", "eq", "20")], "&q=alpha")).json().page.total, "1");
    assert.equal((await get([condition("score", "eq", "20")], "&q=other")).json().page.total, "0");
    assert.equal((await get([condition("missing", "eq", "x")])).statusCode, 400);
    assert.equal((await get([condition("score", "contains", "2")])).statusCode, 400);
    assert.equal((await get([condition("score", "eq", "20.5")])).statusCode, 400);
    assert.equal((await get([condition("author_id", "eq", "not-an-id")])).statusCode, 400);
    assert.equal((await get(Array.from({ length: 11 }, () => condition("score", "eq", "20")))).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: `/items/${posts}`, payload: {
      title: "Blank note", score: 40, published: false,
      issued_at: "2026-04-01T12:00:00Z", note: "", author_id: authorIds[1],
    } })).statusCode, 201);
    assert.equal((await get([condition("note", "eq", "")])).json().page.total, "1");
    assert.equal((await get([condition("note", "isNull")])).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      condition("note", "isEmpty"),
    ] })).json().page.total, "1");

    const [reader] = await database("asmblyr_users").withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    readerId = reader.id;
    const headers = { authorization: `Bearer ${(await issueUserTokens(database, reader.id)).accessToken}` };
    const policy = await app.inject({ method: "POST", url: "/policies",
      payload: { name: `Filter reader ${suffix}` } });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const permission = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: posts, action: "read", fields: ["title", "author_id"] } });
    assert.equal(permission.statusCode, 201, permission.body);
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/permissions/${permission.json().data.id}` })).statusCode, 204);
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/users/${reader.id}` })).statusCode, 204);
    assert.equal((await get([condition("score", "gte", "20")], "", headers)).statusCode, 403);
    assert.equal((await get([condition("title", "contains", "Alpha")], "", headers)).json().page.total, "2");
    assert.equal((await get([condition("author_id", "eq", String(authorIds[0]))], "", headers)).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      condition("author_id.name", "eq", "Ada"),
    ] }, "", headers)).statusCode, 403);
    assert.equal((await get([condition("author_id.id", "exists")], "", headers)).statusCode, 403);
    const authorPermission = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: authors, action: "read", fields: ["name"] } });
    assert.equal(authorPermission.statusCode, 201, authorPermission.body);
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/permissions/${authorPermission.json().data.id}` })).statusCode, 204);
    assert.equal((await get({ logic: "and", children: [
      condition("author_id.name", "eq", "Ada"),
    ] }, "", headers)).json().page.total, "2");
    assert.equal((await get({ logic: "and", children: [
      condition("author_id.secret", "eq", "x"),
    ] }, "", headers)).statusCode, 403);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(junction);
    await database.schema.withSchema("public").dropTableIfExists(posts);
    await database.schema.withSchema("public").dropTableIfExists(authors);
    await database.schema.withSchema("public").dropTableIfExists(tags);
    await database("asmblyr_collections").withSchema("public")
      .whereIn("name", [posts, authors, tags, junction]).delete();
    if (policyId) await database("asmblyr_policies").withSchema("public").where({ id: policyId }).delete();
    if (readerId) await database("asmblyr_users").withSchema("public").where({ id: readerId }).delete();
    await app.close();
    await database.destroy();
  }
});
