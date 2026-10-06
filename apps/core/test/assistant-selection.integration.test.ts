import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createContextTools } from "../src/assistant/context-tools.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("assistant searches inherit relevance and carry it through selection validation", async (t) => {
  const { db, app, access, reload, names, headers } = await mcpFixture(t);
  const tools = (await createContextTools(
    db,
    access,
    {
      page: "items",
      workspaceId: null,
      collection: names.posts,
      table: {
        page: 1,
        size: 25,
        sort: "id",
        direction: "asc",
        order: "relevance",
        q: "Al",
        filter: "",
        selectedCount: 0,
        editorOpen: false,
      },
    },
    reload,
  ))!;
  t.after(() => tools.close!());
  await tools.execute("describe_collection", { collection: names.posts });
  const args = {
    collection: names.posts,
    q: null,
    filter: null,
    sort: null,
    direction: null,
    order: null,
    fields: ["title"],
    limit: 10,
    page: 1,
  };
  const result = (await tools.execute("search_items", args)) as {
    order: string;
    resultId: string;
  };
  assert.equal(result.order, "relevance", JSON.stringify(result));
  await tools.execute("present_selection", { resultId: result.resultId });
  const card = tools.selections![0];
  assert.equal(card.order, "relevance");
  const checked = await app.inject({
    method: "POST",
    url: "/assistant/selection/validate",
    headers,
    payload: {
      collection: card.collection,
      collectionId: card.collectionId,
      q: card.q,
      filter: card.filter,
      sort: card.sort,
      direction: card.direction,
      order: card.order,
    },
  });
  assert.equal(checked.statusCode, 200, checked.body);
  assert.equal(checked.json().data.order, "relevance");
  const manual = (await tools.execute("search_items", {
    ...args,
    sort: "title",
    direction: "desc",
  })) as { order: string };
  assert.equal(manual.order, "field", JSON.stringify(manual));
});

test("selection cards preserve real query results across collections and recheck access on opening", async (t) => {
  const { db, app, access, reload, names, headers, permissions, suffix } =
    await mcpFixture(t);
  const term = await app.inject({
    method: "POST",
    url: "/settings/terms",
    payload: {
      name: `Selection ${suffix}`,
      aliases: [],
      description: "Test term",
      enabled: true,
    },
  });
  assert.equal(term.statusCode, 201, term.body);
  const filter = {
    logic: "and",
    children: [{ field: "title", op: "eq", value: "Alpha" }],
  };
  const binding = await app.inject({
    method: "PUT",
    url: `/collections/${names.posts}/terms/${term.json().data.id}`,
    payload: { filter },
  });
  assert.equal(binding.statusCode, 204, binding.body);
  const tools = (await createContextTools(
    db,
    access,
    { page: "settings", workspaceId: null },
    reload,
  ))!;
  t.after(() => tools.close!());
  assert.ok(
    "error" in
      (await tools.execute("present_selection", { resultId: randomUUID() })),
  );
  await tools.execute("describe_collection", { collection: names.posts });
  const counted = JSON.parse(
    JSON.stringify(
      await tools.execute("count_items", {
        collection: names.posts,
        q: "Al",
        filter: "",
        terms: [term.json().data.id],
      }),
    ),
  );
  assert.equal(counted.count, "1");
  assert.equal(typeof counted.resultId, "string");
  await tools.execute("present_selection", { resultId: counted.resultId });
  await tools.execute("present_selection", { resultId: counted.resultId });
  assert.equal(tools.selections!.length, 1);
  const card = tools.selections![0];
  assert.equal(card.count, "1");
  assert.deepEqual(card.filter, counted.conditions.filter);
  assert.equal(card.q, "Al");
  assert.ok(!JSON.stringify(card).includes("hidden-post-value"));
  const { collection, collectionId, q, sort, direction } = card;
  const payload = {
    collection,
    collectionId,
    q,
    sort,
    direction,
    filter: card.filter,
  };
  const validate = (body: object) =>
    app.inject({
      method: "POST",
      url: "/assistant/selection/validate",
      headers,
      payload: body,
    });
  const checked = await validate(payload);
  assert.equal(checked.statusCode, 200, checked.body);
  assert.deepEqual(checked.json().data.filter, card.filter);
  const params = new URLSearchParams({
    q,
    filter: JSON.stringify(card.filter),
    sort,
    direction,
  });
  const items = await app.inject({
    method: "GET",
    url: `/items/${collection}?${params}`,
    headers,
  });
  assert.equal(items.statusCode, 200, items.body);
  assert.equal(items.json().page.total, card.count);
  assert.equal(
    (await validate({ ...payload, collectionId: randomUUID() })).statusCode,
    409,
  );
  assert.equal(
    (await validate({ ...payload, sort: "secret" })).statusCode,
    403,
  );
  assert.equal(
    (await validate({ ...payload, collection: names.disabled })).statusCode,
    403,
  );
  await db("asmblyr_collections")
    .where({ name: collection })
    .update({ mcp_enabled: false });
  assert.equal((await validate(payload)).statusCode, 403);
  await db("asmblyr_collections")
    .where({ name: collection })
    .update({ mcp_enabled: true });
  await db("asmblyr_permissions")
    .where({ id: permissions.get(collection) })
    .update({ fields: ["id"] });
  assert.equal((await validate(payload)).statusCode, 403);
  assert.ok(
    "error" in
      (await tools.execute("present_selection", {
        resultId: counted.resultId,
      })),
  );
});
