import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("content editors validate API writes, defaults and bulk updates and strip unsafe HTML", async () => {
  const f = await featureFixture(), name = `${f.prefix}_content`; f.names.push(name);
  const { call } = f;
  try {
    await call("POST", "/collections", { name, fields: [{ name: "body", type: "text", required: true }, { name: "url", type: "text" }, { name: "amount", type: "integer" }] }, 201);
    const field = (key: string) => `/collections/${name}/fields/${key}/presentation`;
    await call("PUT", field("body"), { interface: "richtext", constraints: { minLength: 3, maxLength: 20 } });
    await call("PUT", field("url"), { interface: "url" });
    await call("PUT", field("amount"), { constraints: { min: 1, max: 10 } });
    for (const body of ["<p></p>", "<script>alert(1)</script>", "ab", "x".repeat(21)]) await call("POST", `/items/${name}`, { body }, 400);
    for (const url of ["javascript:alert(1)", "data:text/html,a", "//example.com", "https://user:password@example.com", "https://example.com/a b"]) await call("POST", `/items/${name}`, { body: "Valid", url }, 400);
    const item = await call("POST", `/items/${name}`, { body: '<p onclick="bad()">Hello <strong>world</strong><img src="x" onerror="bad()"/><script>bad()</script></p>', url: "https://example.com", amount: 3 }, 201);
    assert.equal(item.body, "<p>Hello <strong>world</strong></p>");
    await call("PATCH", `/collections/${name}/fields/url`, { defaultValue: "javascript:alert(1)" }, 400);
    await call("PUT", field("body"), { interface: "richtext", constraints: { minLength: 3, maxLength: 3 } });
    assert.equal((await call("PATCH", `/items/${name}/${item.id}`, { body: "<p>&amp;&lt;🙂</p>" })).body, "<p>&amp;&lt;🙂</p>");
    await call("PUT", field("body"), { interface: "richtext", constraints: { minLength: 3, maxLength: 20 } });
    await call("PATCH", `/items/${name}/${item.id}`, { amount: 11 }, 400);
    await call("PATCH", `/items/${name}`, { ids: [item.id], values: { body: "x".repeat(21) } }, 400);
    assert.equal((await call("GET", `/items/${name}/${item.id}`)).amount, 3);
    await call("PUT", field("body"), { interface: "markdown", constraints: { minLength: 2 } });
    const markdown = await call("PATCH", `/items/${name}/${item.id}`, { body: "**Markdown**" });
    assert.equal(markdown.body, "**Markdown**");
    for (const settings of [{ interface: "richtext" }, { interface: "url" }, { constraints: { minLength: 2 } }]) await call("PUT", field("amount"), settings, 400);
    await call("PUT", field("body"), { constraints: { minLength: 10, maxLength: 2 } }, 400);
    await call("PUT", field("body"), { constraints: { pattern: ".*" } }, 400);
    await call("PATCH", `/collections/${name}/fields/url`, { defaultValue: "https://example.com" });
    await call("PUT", field("url"), { interface: "url", constraints: { maxLength: 3 } }, 400);
    const defaults = await call("POST", `/items/${name}`, { body: "Valid" }, 201);
    assert.equal(defaults.url, "https://example.com");
  } finally { await f.close(); }
});

test("shared views respect scopes, defaults, field grants and manager ownership", async () => {
  const f = await featureFixture(), name = `${f.prefix}_shared`; f.names.push(name);
  const { call, memberHeaders, db } = f;
  const endpoint = `/table-views/${name}`;
  try {
    await call("POST", "/collections", { name, fields: [{ name: "title", type: "text" }, { name: "secret", type: "text" }] }, 201);
    await f.grant(name, "read", ["title"]);
    const definition = { columns: { order: ["title", "id"], hidden: ["id"] }, sort: { field: "title", direction: "asc" }, pageSize: 50, filter: null, q: "" };
    const workspace = await call("POST", "/workspaces", { name: f.prefix, collections: [name] }, 201);
    const general = await call("POST", endpoint, { name: "General", scope: "collection", isDefault: true, definition }, 201);
    assert.equal((await call("GET", endpoint, undefined, 200, memberHeaders))[0].editable, false);
    await call("PUT", `${endpoint}/${general.id}`, { name: "Changed", definition }, 404, memberHeaders);
    await call("DELETE", `${endpoint}/${general.id}`, undefined, 404, memberHeaders);
    await call("POST", endpoint, { name: "Illegal", scope: "collection", definition }, 403, memberHeaders);
    assert.equal((await call("GET", `${endpoint}/default`, undefined, 200, memberHeaders)).id, general.id);
    const shared = await call("POST", endpoint, { name: "Workspace", scope: "workspace", workspaceId: workspace.id, isDefault: true, definition }, 201);
    assert.ok(!(await call("GET", endpoint, undefined, 200, memberHeaders)).some((v: { id: string }) => v.id === shared.id));
    await call("PUT", "/users/me/workspace", { workspaceId: workspace.id }, 200, memberHeaders);
    assert.equal((await call("GET", `${endpoint}/default`, undefined, 200, memberHeaders)).id, shared.id);
    const own = await call("POST", endpoint, { name: "Own", isDefault: true, definition }, 201, memberHeaders);
    assert.equal((await call("GET", `${endpoint}/default`, undefined, 200, memberHeaders)).id, own.id);
    const own2 = await call("POST", endpoint, { name: "Own2", isDefault: true, definition }, 201, memberHeaders);
    assert.equal((await call("GET", endpoint, undefined, 200, memberHeaders)).filter((v: { scope: string; isDefault: boolean }) => v.scope === "personal" && v.isDefault).length, 1);
    const prefs = await call("GET", `/users/me/table-preferences/${name}`, undefined, 200, memberHeaders);
    assert.equal(prefs.pageSize, 50); assert.deepEqual(prefs.columns, definition.columns);
    await call("PATCH", `/users/me/table-preferences/${name}`, { pageSize: 10 }, 200, memberHeaders);
    assert.equal((await call("GET", `/users/me/table-preferences/${name}`, undefined, 200, memberHeaders)).pageSize, 10);
    const sensitive = await call("POST", endpoint, { name: "Sensitive", scope: "collection", isDefault: true, definition: { ...definition, filter: { logic: "and", children: [{ field: "secret", op: "eq", value: "private" }] } } }, 201);
    const hidden = (await call("GET", endpoint, undefined, 200, memberHeaders)).find((v: { id: string }) => v.id === sensitive.id);
    assert.equal(hidden.definition, null); assert.equal(hidden.available, false);
    await call("DELETE", `${endpoint}/${own2.id}`, undefined, 204, memberHeaders);
    await call("DELETE", `/workspaces/${workspace.id}`, undefined, 204);
    assert.equal(await db("asmblyr_table_views").where({ id: shared.id }).first(), undefined);
    assert.equal(await call("GET", `${endpoint}/default`, undefined, 200, memberHeaders), null);
    await call("POST", endpoint, { name: "Missing", scope: "workspace", workspaceId: workspace.id, definition }, 404);
    await call("GET", endpoint, undefined, 401, { authorization: "Bearer invalid" });
  } finally { await f.close(); }
});

test("boolean and integer filters survive preset/view reload, including older typed storage", async () => {
  const f = await featureFixture(), name = `${f.prefix}_filter_roundtrip`; f.names.push(name);
  try {
    await f.call("POST", "/collections", { name, fields: [{ name: "active", type: "boolean" }, { name: "score", type: "integer" }] }, 201);
    const item = await f.call("POST", `/items/${name}`, { active: true, score: 5 }, 201);
    await f.call("POST", `/items/${name}`, { active: false, score: 5 }, 201);
    const filter = { logic: "and", children: [{ field: "active", op: "eq", value: "true" },
      { field: "score", op: "between", value: ["3", "8"] }] };
    const legacyFilter = { logic: "and", children: [{ field: "active", op: "eq", value: true },
      { field: "score", op: "between", value: [3, 8] }] };
    const definition = { columns: { order: ["id", "active", "score"], hidden: [] },
      sort: { field: "score", direction: "asc" }, pageSize: 10, q: "", filter };
    const view = await f.call("POST", `/table-views/${name}`, { name: "Active range", scope: "collection", isDefault: true, definition }, 201);
    assert.deepEqual(view.definition.filter, filter);
    assert.deepEqual((await f.call("GET", `/table-views/${name}/default`)).definition.filter, filter);
    const preset = await f.call("POST", `/filter-presets/${name}`, { name: "Active range", filter }, 201);
    assert.deepEqual((await f.call("GET", `/filter-presets/${name}`))[0].filter, filter);
    await f.db("asmblyr_table_views").where({ id: view.id }).update({ definition: JSON.stringify({ ...definition, filter: legacyFilter }) });
    await f.db("asmblyr_filter_presets").where({ id: preset.id }).update({ filter: JSON.stringify(legacyFilter) });
    const loaded = await f.call("GET", `/table-views/${name}/default`);
    assert.equal(loaded.id, view.id); assert.deepEqual(loaded.definition.filter, filter);
    assert.deepEqual((await f.call("GET", `/filter-presets/${name}`))[0].filter, filter);
    const result = await f.app.inject({ method: "GET", url: `/items/${name}?filter=${encodeURIComponent(JSON.stringify(loaded.definition.filter))}`, headers: f.adminHeaders });
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(result.json().data.map((row: { id: string }) => row.id), [item.id]);
    await f.call("POST", `/filter-presets/${name}`, { name: "Typed API input", filter: legacyFilter }, 400);
  } finally { await f.close(); }
});
