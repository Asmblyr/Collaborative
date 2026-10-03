import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import { executeAggregateTool } from "../src/tools/aggregate-tool.js";

const query = {
  q: "",
  filter: "",
  terms: null,
  groupBy: [],
  metrics: [{ operation: "count", field: null }],
  orderBy: null,
  page: 1,
  limit: 20,
};
const condition = (field: string, value: string) => ({
  logic: "and",
  children: [{ field, op: "eq", value }],
});
function json(value: object) {
  return JSON.parse(JSON.stringify(value));
}

test("aggregates calculate exact metrics over complete data with stable group paging and honest NULL semantics", async (t) => {
  const { app, db, names, reload, permissions } = await mcpFixture(t);
  for (const [name, type] of [
    ["amount", "decimal"],
    ["quantity", "integer"],
    ["occurred", "datetime"],
    ["metadata", "json"],
  ]) {
    const added = await app.inject({
      method: "POST",
      url: `/collections/${names.posts}/fields`,
      payload: { name, type, nullable: true },
    });
    assert.equal(added.statusCode, 201, added.body);
  }
  await db("asmblyr_permissions")
    .where({ id: permissions.get(names.posts) })
    .update({
      fields: [
        "title",
        "author_id",
        "amount",
        "quantity",
        "occurred",
        "metadata",
      ],
    });
  await db(names.posts)
    .where({ title: "Alpha" })
    .update({ amount: "10", quantity: 2, occurred: "2026-01-01T00:00:00Z" });
  await db(names.posts)
    .where({ title: "Beta" })
    .update({ amount: "2", quantity: 4 });
  await db(names.posts).insert([
    {
      title: "Gamma",
      author_id: "author-a",
      occurred: "2026-01-01T00:00:00.000001Z",
    },
    {
      title: "",
      author_id: "author-a",
      amount: "0",
      quantity: -1,
      occurred: "2026-02-01T00:00:00Z",
    },
    { title: null },
    { title: "Huge", amount: "9007199254740993.1234567890" },
  ]);
  const tools = (await createContextTools(
    db,
    await reload(),
    { page: "settings", workspaceId: null },
    reload,
  ))!;
  t.after(() => tools.close!());
  const execute = async (overrides: object = {}) =>
    json(
      await tools.execute("aggregate_items", {
        collection: names.posts,
        ...query,
        ...overrides,
      }),
    );
  assert.ok("error" in (await execute()));
  const description = json(
    await tools.execute("describe_collection", { collection: names.posts }),
  );
  assert.ok(
    description.filterPaths
      .find((path) => path.path === "amount")
      .aggregation.operations.includes("sum"),
  );
  assert.equal(
    description.filterPaths.find((path) => path.path === "metadata"),
    undefined,
  );
  assert.equal(
    description.filterPaths.find((path) => path.path === "author_id.title")
      .aggregation,
    undefined,
  );
  const total = await execute({
    metrics: [
      { operation: "count", field: null },
      { operation: "count", field: "amount" },
      { operation: "sum", field: "amount" },
      { operation: "avg", field: "quantity" },
      { operation: "count_distinct", field: "author_id" },
    ],
  });
  assert.equal(total.groups[0].count, "6");
  assert.deepEqual(total.groups[0].metrics.slice(0, 3), [
    "6",
    "4",
    "9007199254741005.1234567890",
  ]);
  assert.match(total.groups[0].metrics[3], /^1\.666666/);
  assert.equal(total.groups[0].metrics[4], "1");
  const dates = await execute({
    metrics: [
      { operation: "min", field: "occurred" },
      { operation: "max", field: "occurred" },
    ],
  });
  assert.match(dates.groups[0].metrics[0], /^2026-01-01/);
  assert.match(dates.groups[0].metrics[1], /^2026-02-01/);
  const dateGroups = await execute({ groupBy: ["occurred"] });
  assert.equal(
    dateGroups.groups.find(
      (group) => group.values.occurred === "2026-01-01T00:00:00.000001Z",
    ).resultId,
    null,
  );
  const exactDate = dateGroups.groups.find(
    (group) => group.values.occurred === "2026-01-01T00:00:00.000Z",
  );
  assert.ok(exactDate.resultId);
  assert.ok(
    !(
      "error" in
      (await tools.execute("present_selection", {
        resultId: exactDate.resultId,
      }))
    ),
  );
  const grouped = await execute({
    groupBy: ["title"],
    metrics: [{ operation: "sum", field: "amount" }],
    orderBy: { metric: 0, direction: "asc" },
    limit: 2,
  });
  assert.deepEqual(
    grouped.groups.map((group) => group.metrics[0]),
    ["0.0000000000", "2.0000000000"],
  );
  assert.equal(grouped.hasMore, true);
  const next = await execute({
    groupBy: ["title"],
    metrics: [{ operation: "sum", field: "amount" }],
    orderBy: { metric: 0, direction: "asc" },
    limit: 2,
    page: 2,
  });
  assert.deepEqual(
    next.groups.map((group) => group.values.title),
    ["Alpha", "Huge"],
  );
  const empty = await execute({
    filter: JSON.stringify(condition("title", "missing")),
    metrics: [
      { operation: "sum", field: "amount" },
      { operation: "avg", field: "amount" },
      { operation: "count", field: null },
    ],
  });
  assert.deepEqual(empty.groups[0].metrics, [null, null, "0"]);
  assert.equal(
    (
      await execute({
        groupBy: ["title"],
        filter: JSON.stringify(condition("title", "missing")),
      })
    ).groups.length,
    0,
  );
  const related = await execute({
    groupBy: ["author_id"],
    filter: JSON.stringify(condition("author_id.title", "Ada")),
  });
  assert.equal(related.groups[0].count, "3");
  assert.equal(related.groups[0].values.author_id, "author-a");
  for (const fields of [
    { groupBy: ["secret"] },
    { metrics: [{ operation: "sum", field: "title" }] },
    { groupBy: ["metadata"] },
    { metrics: [{ operation: "count", field: "secret" }] },
    { groupBy: ["author_id.title"] },
  ])
    assert.ok("error" in (await execute(fields)));
  const cancelled = new AbortController();
  cancelled.abort();
  assert.ok(
    "error" in
      (await tools.execute(
        "aggregate_items",
        { collection: names.posts, ...query },
        cancelled.signal,
      )),
  );
  await db("asmblyr_collections")
    .where({ name: names.posts })
    .update({ mcp_enabled: false });
  assert.ok("error" in (await execute()));
  await db("asmblyr_collections")
    .where({ name: names.posts })
    .update({ mcp_enabled: true });
  await db("asmblyr_permissions")
    .where({ id: permissions.get(names.posts) })
    .update({ fields: ["id"] });
  assert.ok("error" in (await execute({ groupBy: ["title"] })));
  await assert.rejects(
    executeAggregateTool(db, await reload(), names.posts, randomUUID(), query),
    /Collection changed/,
  );
});

test("group drilldown uses verified terms/search and distinguishes null, empty and clipped keys", async (t) => {
  const { app, db, names, access, reload, headers, suffix } =
    await mcpFixture(t);
  await db(names.posts).insert([
    { title: "", author_id: "author-a" },
    { title: null },
    { title: "x".repeat(500) },
    { title: "x".repeat(499) + "y" },
  ]);
  const term = await app.inject({
    method: "POST",
    url: "/settings/terms",
    payload: {
      name: `Aggregate ${suffix}`,
      description: "Only Ada",
      aliases: [],
      enabled: true,
    },
  });
  assert.equal(term.statusCode, 201, term.body);
  const bound = await app.inject({
    method: "PUT",
    url: `/collections/${names.posts}/terms/${term.json().data.id}`,
    payload: { filter: condition("author_id.title", "Ada") },
  });
  assert.equal(bound.statusCode, 204, bound.body);
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
        q: "Al",
        filter: "",
        selectedCount: 0,
        editorOpen: false,
      },
    },
    reload,
  ))!;
  t.after(() => tools.close!());
  await tools.execute("describe_collection", { collection: null });
  const result = json(
    await tools.execute("aggregate_items", {
      ...query,
      collection: null,
      q: null,
      groupBy: ["title"],
      terms: [term.json().data.id],
    }),
  );
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].values.title, "Alpha");
  assert.equal(result.conditions.q, "Al");
  assert.equal(result.conditions.appliedTerms.length, 1);
  await tools.execute("present_selection", {
    resultId: result.groups[0].resultId,
  });
  const card = tools.selections![0];
  const params = new URLSearchParams({
    q: card.q,
    filter: JSON.stringify(card.filter),
  });
  const list = await app.inject({
    method: "GET",
    url: `/items/${names.posts}?${params}`,
    headers,
  });
  assert.equal(list.json().page.total, "1");
  const all = json(
    await tools.execute("aggregate_items", {
      ...query,
      collection: null,
      groupBy: ["title"],
    }),
  );
  const long = all.groups.filter((group) => group.truncatedFields.length);
  assert.equal(long.length, 2);
  assert.equal(long[0].values.title, long[1].values.title);
  assert.ok(
    long.every((group) => group.resultId === null && group.count === "1"),
  );
  const fullFilter = {
    logic: "and",
    children: Array(20).fill({ field: "title", op: "eq", value: "Alpha" }),
  };
  const full = json(
    await tools.execute("aggregate_items", {
      ...query,
      collection: null,
      groupBy: ["title"],
      filter: JSON.stringify(fullFilter),
    }),
  );
  assert.equal(full.groups[0].count, "1");
  assert.equal(full.groups[0].selectable, false);
  assert.equal(full.groups[0].resultId, null);
  for (const group of all.groups.filter(
    (group) => group.values.title === null || group.values.title === "",
  )) {
    await tools.execute("present_selection", { resultId: group.resultId });
    const selection = tools.selections!.at(-1)!;
    const items = await app.inject({
      method: "GET",
      url: `/items/${names.posts}?${new URLSearchParams({ filter: JSON.stringify(selection.filter) })}`,
      headers,
    });
    assert.equal(items.json().page.total, group.count);
    assert.equal(items.json().data[0].title, group.values.title);
  }
});
