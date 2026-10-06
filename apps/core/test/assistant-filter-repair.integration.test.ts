import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createContextTools } from "../src/assistant/context-tools.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("a malformed filter gets an actionable reason and a corrected lookup ignores another table's filter", async (t) => {
  const { db, names, access, reload } = await mcpFixture(t);
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
        q: "Alpha",
        filter: JSON.stringify({
          logic: "and",
          children: [{ field: "id", op: "eq", value: "1" }],
        }),
        sort: "id",
        direction: "desc",
        selectedCount: 0,
        editorOpen: false,
      },
    },
    reload,
  ))!;
  try {
    await tools.execute("describe_collection", { collection: names.people });
    await db(names.people).insert({ code: "literal-null", title: "null" });
    const args = {
      collection: names.people,
      q: "Ada",
      filter: "",
      fields: ["title"],
      limit: 5,
      page: 1,
      sort: null,
      direction: null,
      terms: null,
    };
    const badSearch = await tools.execute("search_items", {
      ...args,
      q: "null",
    });
    assert.ok("code" in badSearch && badSearch.code === "INVALID_ARGUMENTS");
    assert.ok("arguments" in badSearch);
    assert.deepEqual(badSearch.arguments, ["q"]);
    const literalSearch = await tools.execute("search_items", {
      ...args,
      q: "NULL",
    });
    assert.ok("items" in literalSearch);
    assert.equal(
      JSON.parse(JSON.stringify(literalSearch)).items[0].values.title,
      "null",
    );
    const badCatalog = await tools.execute("list_collections", {
      q: "null",
      page: 1,
      limit: 5,
    });
    assert.ok("code" in badCatalog && badCatalog.code === "INVALID_ARGUMENTS");
    for (const filter of [
      "null",
      JSON.stringify({ field: "title", op: "eq", value: "private-operand" }),
      JSON.stringify({ title: { _contains: "private-operand" } }),
    ]) {
      const result = await tools.execute("search_items", { ...args, filter });
      assert.ok("code" in result);
      assert.equal(result.code, "INVALID_FILTER");
      assert.ok("reason" in result);
      assert.ok("hint" in result && String(result.hint).includes("logic"));
      assert.ok(!JSON.stringify(result).includes("private-operand"));
    }
    const corrected = await tools.execute("search_items", args);
    assert.ok("items" in corrected);
    const result = JSON.parse(JSON.stringify(corrected));
    assert.equal(result.items[0].values.title, "Ada");
    assert.equal(result.conditions.q, "Ada");
    assert.deepEqual(result.conditions.filter, { logic: "and", children: [] });
    assert.equal(result.sort, "code");
    assert.equal(result.direction, "asc");
    assert.equal(result.hasMore, false);

    const filtered = await tools.execute("search_items", {
      ...args,
      q: "",
      filter: JSON.stringify({
        logic: "and",
        children: [{ field: "title", op: "eq", value: "Ada" }],
      }),
    });
    assert.ok("items" in filtered);
    assert.equal(JSON.parse(JSON.stringify(filtered)).items.length, 1);
    const inheritedTools = (await createContextTools(
      db,
      access,
      {
        page: "items",
        workspaceId: null,
        collection: names.people,
        table: {
          page: 1,
          size: 25,
          q: "null",
          filter: "",
          sort: "code",
          direction: "asc",
          selectedCount: 0,
          editorOpen: false,
        },
      },
      reload,
    ))!;
    try {
      await inheritedTools.execute("describe_collection", { collection: null });
      const inherited = await inheritedTools.execute("search_items", {
        ...args,
        collection: null,
        q: null,
      });
      assert.ok("items" in inherited);
      const rows = JSON.parse(JSON.stringify(inherited)).items;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].values.title, "null");
    } finally {
      await inheritedTools.close?.();
    }
  } finally {
    await tools.close?.();
  }
});
