import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { defaultCollectionState } from "@asmblyr-collaborative/contracts";
import { createToolSession } from "../src/tools/session.js";
import { connectInternalMcp } from "../src/mcp/internal-client.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

function condition(field: string, value: string) {
  return { logic: "and", children: [{ field, op: "eq", value }] };
}

function json(value: object) {
  return JSON.parse(JSON.stringify(value));
}

test("administrator terms are editable, reusable and applied by MCP with current field grants", async (t) => {
  const { app, db, names, suffix, access, reload, headers, permissions } =
    await mcpFixture(t);
  const input = {
    name: `Active ${suffix}`,
    aliases: [`Enabled ${suffix}`],
    description: "Working records",
    enabled: true,
  };
  async function request(
    method: "POST" | "PUT" | "GET" | "PATCH",
    url: string,
    payload?: object,
    status = 200,
  ) {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, status, response.body);
    return response.statusCode === 204 ? undefined : response.json().data;
  }
  const term = await request("POST", "/settings/terms", input, 201);
  const termId = term.id as string;
  await request("PATCH", `/collections/${names.posts}/settings`, {
    state: defaultCollectionState(),
  });
  await db(names.posts).where({ title: "Beta" }).update({ status: "draft" });
  await db("asmblyr_permissions")
    .where({ id: permissions.get(names.posts) })
    .update({ fields: ["title", "author_id", "status"] });
  const bindingPath = `/collections/${names.posts}/terms/${termId}`;
  await request(
    "PUT",
    bindingPath,
    { filter: condition("status", "published") },
    204,
  );
  await request(
    "PUT",
    `/collections/${names.people}/terms/${termId}`,
    { filter: condition("title", "Ada") },
    204,
  );
  assert.equal(
    (await request("GET", `/collections/${names.posts}/terms`)).bindings.length,
    1,
  );
  for (const [method, url, payload] of [
    ["GET", "/settings/terms", undefined],
    ["POST", "/settings/terms", input],
    ["PUT", `/settings/terms/${termId}`, input],
    ["GET", `/collections/${names.posts}/terms`, undefined],
    ["PUT", bindingPath, { filter: condition("status", "published") }],
    ["DELETE", bindingPath, undefined],
  ] as const) {
    assert.equal(
      (await app.inject({ method, url, payload, headers })).statusCode,
      403,
    );
  }
  const client = await connectInternalMcp(
    createToolSession(db, await reload(), reload),
  );
  try {
    const description = json(
      await client.call("describe_collection", { collection: names.posts }),
    );
    assert.equal(description.terms[0].id, termId);
    assert.equal(description.termsPartial, false);
    assert.equal(description.terms[0].aliases[0], input.aliases[0]);
    const query = {
      collection: names.posts,
      q: "",
      filter: "",
      terms: [termId],
    };
    const count = json(await client.call("count_items", query));
    assert.equal(count.count, "1");
    assert.equal(count.conditions.appliedTerms[0].name, input.name);
    const related = await client.call("count_items", {
      ...query,
      filter: JSON.stringify(condition("author_id.title", "Ada")),
    });
    assert.equal(json(related).count, "1");
    assert.equal(
      json(
        await client.call("count_items", {
          ...query,
          filter: JSON.stringify(condition("title", "Beta")),
        }),
      ).count,
      "0",
    );
    const rows = json(
      await client.call("search_items", {
        ...query,
        fields: ["title"],
        page: 1,
        limit: 20,
        sort: null,
        direction: null,
      }),
    );
    assert.equal(rows.items.length, 1);
    assert.equal(rows.items[0].values.title, "Alpha");
    assert.ok(
      "error" in
        (await client.call("count_items", { ...query, terms: [randomUUID()] })),
    );
    assert.ok(
      "error" in
        (await client.call("count_items", {
          ...query,
          terms: [termId, termId],
        })),
    );

    // Saved conditions and the definition take effect on the next invocation.
    await request(
      "PUT",
      bindingPath,
      { filter: condition("status", "draft") },
      204,
    );
    await request("PUT", `/settings/terms/${termId}`, {
      ...input,
      name: `Current ${suffix}`,
    });
    const changed = json(
      await client.call("search_items", {
        ...query,
        fields: ["title"],
        page: 1,
        limit: 20,
        sort: null,
        direction: null,
      }),
    );
    assert.equal(changed.items[0].values.title, "Beta");
    assert.equal(changed.conditions.appliedTerms[0].name, `Current ${suffix}`);

    // Denied term fields cannot be inferred through counts or schema metadata.
    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.posts) })
      .update({ fields: ["title", "author_id"] });
    assert.deepEqual(
      json(
        await client.call("describe_collection", { collection: names.posts }),
      ).terms,
      [],
    );
    assert.ok("error" in (await client.call("count_items", query)));
    await client.call("describe_collection", { collection: names.people });
    assert.equal(
      json(
        await client.call("count_items", {
          ...query,
          collection: names.people,
        }),
      ).count,
      "1",
    );
    await request("PUT", `/settings/terms/${termId}`, {
      ...input,
      enabled: false,
    });
    assert.deepEqual(
      json(
        await client.call("describe_collection", { collection: names.people }),
      ).terms,
      [],
    );
    assert.ok(
      "error" in
        (await client.call("count_items", {
          ...query,
          collection: names.people,
        })),
    );
    assert.equal(
      (await request("GET", `/collections/${names.people}/terms`)).bindings
        .length,
      1,
    );
  } finally {
    await client.close();
  }
  assert.equal(access.principal.superuser, false);
});

test("term bindings validate atomically and preserve OR semantics; stale and disabled relation conditions fail closed", async (t) => {
  const { app, db, names, suffix, access, reload, permissions } =
    await mcpFixture(t);
  const input = {
    name: `Selected ${suffix}`,
    aliases: [],
    description: "Selected records",
    enabled: true,
  };
  const created = await app.inject({
    method: "POST",
    url: "/settings/terms",
    payload: input,
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().data.id;
  const path = `/collections/${names.posts}/terms`;
  const either = {
    logic: "or",
    children: [
      condition("title", "Alpha").children[0],
      condition("title", "Beta").children[0],
    ],
  };
  const save = (bindings: object[]) =>
    app.inject({ method: "PUT", url: path, payload: { bindings } });
  assert.equal((await save([{ termId: id, filter: either }])).statusCode, 204);
  assert.equal(
    (await save([{ termId: id, filter: condition("missing", "x") }]))
      .statusCode,
    400,
  );
  assert.deepEqual(
    (await app.inject({ method: "GET", url: path })).json().data.bindings[0]
      .filter,
    either,
  );
  assert.equal(
    (await save([{ termId: id, filter: { logic: "and", children: [] } }]))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await save([
        { termId: id, filter: either },
        { termId: id, filter: either },
      ])
    ).statusCode,
    400,
  );
  const duplicate = await app.inject({
    method: "POST",
    url: "/settings/terms",
    payload: { ...input, name: input.name.toUpperCase() },
  });
  assert.equal(duplicate.statusCode, 409);
  const client = await connectInternalMcp(
    createToolSession(db, access, reload),
  );
  try {
    await client.call("describe_collection", { collection: names.posts });
    const query = {
      collection: names.posts,
      q: "",
      filter: JSON.stringify(condition("title", "Alpha")),
      terms: [id],
    };
    assert.equal(json(await client.call("count_items", query)).count, "1");
    assert.equal(
      (
        await save([
          { termId: id, filter: condition("author_id.title", "Ada") },
        ])
      ).statusCode,
      204,
    );
    await db("asmblyr_collections")
      .where({ name: names.people })
      .update({ mcp_enabled: false });
    assert.deepEqual(
      json(
        await client.call("describe_collection", { collection: names.posts }),
      ).terms,
      [],
    );
    assert.ok("error" in (await client.call("count_items", query)));
    await db("asmblyr_collections")
      .where({ name: names.people })
      .update({ mcp_enabled: true });
    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.people) })
      .delete();
    assert.ok("error" in (await client.call("count_items", query)));
    await save([]);
    assert.ok("error" in (await client.call("count_items", query)));
    assert.equal(
      json(await client.call("count_items", { ...query, terms: null })).count,
      "1",
    );
  } finally {
    await client.close();
  }
});

test("large term dictionaries expose complete bounded definitions and report omitted terms", async (t) => {
  const { app, db, names, suffix, access, reload } = await mcpFixture(t);
  const filter = {
    logic: "or",
    children: Array.from({ length: 20 }, (_, index) => ({
      field: "title",
      op: "eq",
      value: String(index) + "x".repeat(250),
    })),
  };
  const bindings: { termId: string; filter: object }[] = [];
  for (let index = 0; index < 2; index++) {
    const response = await app.inject({
      method: "POST",
      url: "/settings/terms",
      payload: {
        name: `Large ${suffix} ${index}`,
        aliases: [],
        description: "x".repeat(1000),
        enabled: true,
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    bindings.push({ termId: response.json().data.id, filter });
  }
  const saved = await app.inject({
    method: "PUT",
    url: `/collections/${names.posts}/terms`,
    payload: { bindings },
  });
  assert.equal(saved.statusCode, 204, saved.body);
  const session = createToolSession(db, access, reload);
  const described = json(
    await session.execute("describe_collection", { collection: names.posts }),
  );
  assert.equal(described.termsPartial, true);
  assert.equal(described.terms.length, 1);
  assert.deepEqual(described.terms[0].filter, filter);
  assert.ok(JSON.stringify(described.terms).length < 12_000);
});
