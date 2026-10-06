import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { createToolSession } from "../src/tools/session.js";
import { connectInternalMcp } from "../src/mcp/internal-client.js";

function json(value: object) {
  return JSON.parse(JSON.stringify(value));
}

test("M2M and O2M discovery produces usable related reads and respects grants, row rules and MCP scope", async (t) => {
  const { app, db, names, suffix, reload, permissions } = await mcpFixture(t);
  const junction = `test_mcp_links_${suffix}`;
  let client: Awaited<ReturnType<typeof connectInternalMcp>> | undefined;
  try {
    for (const [source, payload] of [
      [
        names.posts,
        {
          kind: "m2m",
          name: "collaborators",
          targetCollection: names.people,
          junctionCollection: junction,
          sourceKey: "post_id",
          targetKey: "person_code",
          reverseField: "articles",
        },
      ],
      [
        names.people,
        {
          kind: "o2m",
          name: "posts",
          targetCollection: names.posts,
          foreignKey: "author_id",
          reuseExisting: true,
        },
      ],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/collections/${source}/relations`,
        payload,
      });
      assert.equal(response.statusCode, 201, response.body);
    }
    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.posts) })
      .update({ fields: ["title", "author_id", "collaborators"] });
    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.people) })
      .update({ fields: ["title", "articles", "posts"] });
    await db(names.people).insert({
      code: "author-b",
      title: "Unrelated",
      secret: "private-value",
    });
    await db(junction).insert({ post_id: 1, person_code: "author-a" });
    client = await connectInternalMcp(
      createToolSession(db, await reload(), reload),
    );
    const describe = async (collection: string) =>
      json(await client!.call("describe_collection", { collection }));
    const postSchema = await describe(names.posts);
    const alias = postSchema.fields.find(
      (field) => field.name === "collaborators",
    );
    assert.equal(alias.readableValue, false);
    assert.deepEqual(alias.relation.relatedRead, {
      collection: names.people,
      filterField: "articles.id",
      op: "eq",
      quantifier: "some",
      valueFrom: "id",
    });
    const peopleSchema = await describe(names.people);
    const reverse = peopleSchema.fields.find(
      (field) => field.name === "posts",
    ).relation;
    assert.deepEqual(reverse.relatedRead, {
      collection: names.posts,
      filterField: "author_id",
      op: "eq",
      valueFrom: "code",
    });

    async function readRelated(plan: typeof reverse.relatedRead, id: string) {
      return json(
        await client!.call("search_items", {
          collection: plan.collection,
          q: "",
          fields: ["title"],
          page: 1,
          limit: 20,
          sort: null,
          direction: null,
          terms: null,
          filter: JSON.stringify({
            logic: "and",
            children: [
              {
                field: plan.filterField,
                op: plan.op,
                value: id,
                ...(plan.quantifier ? { quantifier: plan.quantifier } : {}),
              },
            ],
          }),
        }),
      );
    }
    const collaborators = await readRelated(alias.relation.relatedRead, "1");
    assert.ok(!collaborators.error, JSON.stringify(collaborators));
    assert.deepEqual(
      collaborators.items.map((item) => item.values.title),
      ["Ada"],
    );
    const posts = await readRelated(reverse.relatedRead, "author-a");
    assert.ok(!posts.error, JSON.stringify(posts));
    assert.deepEqual(
      posts.items.map((item) => item.values.title),
      ["Alpha"],
    );
    assert.ok(
      !JSON.stringify([
        postSchema,
        peopleSchema,
        collaborators,
        posts,
      ]).includes("private-value"),
    );

    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.people) })
      .update({ fields: ["title"] });
    const restricted = await describe(names.posts);
    assert.equal(
      restricted.fields.find((field) => field.name === "collaborators").relation
        .relatedRead,
      undefined,
    );

    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.people) })
      .update({ fields: ["title", "articles", "posts"] });
    const rowScoped = await reload();
    rowScoped.rowRules = new Map([[`${names.people}:read`, []]]);
    const scoped = await connectInternalMcp(
      createToolSession(db, rowScoped, async () => rowScoped),
    );
    try {
      const schema = json(
        await scoped.call("describe_collection", { collection: names.posts }),
      );
      assert.equal(
        schema.fields.find((field) => field.name === "collaborators").relation
          .relatedRead,
        undefined,
      );
      assert.ok(
        !schema.filterPaths.some((entry) =>
          entry.path.startsWith("collaborators."),
        ),
      );
    } finally {
      await scoped.close();
    }

    await db("asmblyr_collections")
      .where({ name: junction })
      .update({ mcp_enabled: false });
    assert.ok(
      !(await describe(names.posts)).fields.some(
        (field) => field.name === "collaborators",
      ),
    );
    await db("asmblyr_collections")
      .where({ name: names.people })
      .update({ mcp_enabled: false });
    assert.ok(
      !(await describe(names.posts)).fields.some(
        (field) => field.name === "author_id" && field.relation,
      ),
    );
  } finally {
    await client?.close();
    await db.schema.dropTableIfExists(junction);
    await db("asmblyr_collections").where({ name: junction }).delete();
  }
});
