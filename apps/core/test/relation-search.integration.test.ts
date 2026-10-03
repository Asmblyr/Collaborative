import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("relation search covers one hop, permissions, and stable pagination", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const authors = `test_search_authors_${suffix}`;
  const posts = `test_search_posts_${suffix}`;
  const tags = `test_search_tags_${suffix}`;
  const junction = `test_search_links_${suffix}`;
  let readerId: string | undefined;
  let policyId: string | undefined;
  const request = (
    method: "GET" | "POST" | "PUT" | "PATCH",
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ) => app.inject({ method, url, payload, headers });
  const total = async (
    collection: string,
    query: string,
    headers?: Record<string, string>,
  ) => {
    const response = await request(
      "GET",
      `/items/${collection}?q=${encodeURIComponent(query)}`,
      undefined,
      headers,
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json().page.total as string;
  };

  try {
    for (const name of [authors, posts, tags]) {
      const result = await request("POST", "/collections", {
        name,
        primaryKey: { name: "id", type: "serial" },
        fields: [{ name: "title", type: "text" }],
      });
      assert.equal(result.statusCode, 201, result.body);
    }
    for (const [source, payload] of [
      [
        posts,
        {
          kind: "m2o",
          name: "author_id",
          targetCollection: authors,
          reverseField: "articles",
        },
      ],
      [
        posts,
        {
          kind: "m2m",
          name: "tags",
          targetCollection: tags,
          junctionCollection: junction,
          sourceKey: "post_id",
          targetKey: "tag_id",
        },
      ],
    ] as const) {
      const result = await request(
        "POST",
        `/collections/${source}/relations`,
        payload,
      );
      assert.equal(result.statusCode, 201, result.body);
    }
    const catalog = await request("GET", "/collections");
    for (const [collection, field] of [
      [posts, "author_id"],
      [posts, "tags"],
      [authors, "articles"],
    ]) {
      assert.equal(
        catalog
          .json()
          .data.find((entry: { name: string }) => entry.name === collection)
          .fields.find((entry: { name: string }) => entry.name === field)
          .searchable,
        false,
      );
    }
    const author = await request("POST", `/items/${authors}`, {
      title: "Cobalt author",
    });
    const otherAuthor = await request("POST", `/items/${authors}`, {
      title: "Other author",
    });
    const post1 = await request("POST", `/items/${posts}`, {
      title: "First article",
      author_id: author.json().data.id,
    });
    const post2 = await request("POST", `/items/${posts}`, {
      title: "Second article",
      author_id: otherAuthor.json().data.id,
    });
    const tag1 = await request("POST", `/items/${tags}`, {
      title: "Quartz one",
    });
    const tag2 = await request("POST", `/items/${tags}`, {
      title: "Quartz two",
    });
    for (const [post, tag] of [
      [post1, tag1],
      [post1, tag2],
      [post2, tag1],
    ]) {
      const link = await request("POST", `/items/${junction}`, {
        post_id: post.json().data.id,
        tag_id: tag.json().data.id,
      });
      assert.equal(link.statusCode, 201, link.body);
    }
    assert.equal(await total(posts, "Cobalt"), "0");
    assert.equal(await total(authors, "First article"), "0");
    assert.equal(await total(posts, "Quartz"), "0");

    const configure = async (
      collection: string,
      field: string,
      searchable: boolean,
    ) => {
      const response = await request(
        "PUT",
        `/collections/${collection}/relations/${field}/search`,
        { searchable },
      );
      assert.equal(response.statusCode, 200, response.body);
    };
    assert.equal(
      (
        await request(
          "PUT",
          `/collections/${posts}/relations/author_id/search`,
          { searchable: "yes" },
        )
      ).statusCode,
      400,
    );
    await configure(posts, "author_id", true);
    await configure(authors, "articles", true);
    await configure(posts, "tags", true);
    assert.equal(await total(posts, "Cobalt"), "1");
    assert.equal(await total(authors, "First article"), "1");
    assert.equal(await total(posts, "Quartz"), "2");
    assert.equal(await total(authors, "Quartz"), "0");
    const first = await request(
      "GET",
      `/items/${posts}?q=Quartz&limit=1&page=1`,
    );
    const second = await request(
      "GET",
      `/items/${posts}?q=Quartz&limit=1&page=2`,
    );
    assert.equal(first.json().page.total, "2");
    assert.equal(second.json().page.total, "2");
    assert.notEqual(first.json().data[0].id, second.json().data[0].id);
    const global = await request("GET", "/search?q=Cobalt");
    assert.ok(
      global
        .json()
        .items.some(
          (entry: { collection: string; id: string }) =>
            entry.collection === posts &&
            entry.id === String(post1.json().data.id),
        ),
    );
    assert.equal(
      global
        .json()
        .items.filter(
          (entry: { collection: string; id: string }) =>
            entry.collection === posts &&
            entry.id === String(post1.json().data.id),
        ).length,
      1,
    );

    const [reader] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    readerId = reader.id;
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, reader.id)).accessToken}`,
    };
    const policy = await request("POST", "/policies", {
      name: `Relation search ${suffix}`,
    });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const permissions: Record<string, string> = {};
    for (const [collection, fields] of [
      [posts, ["title", "author_id", "tags"]],
      [authors, ["title", "articles"]],
      [tags, ["title"]],
    ] as const) {
      const permission = await request("POST", "/permissions", {
        collection,
        action: "read",
        fields,
      });
      assert.equal(permission.statusCode, 201, permission.body);
      permissions[collection] = permission.json().data.id as string;
      assert.equal(
        (
          await request(
            "PUT",
            `/policies/${policyId}/permissions/${permissions[collection]}`,
          )
        ).statusCode,
        204,
      );
    }
    assert.equal(
      (await request("PUT", `/policies/${policyId}/users/${reader.id}`))
        .statusCode,
      204,
    );
    assert.equal(await total(posts, "Cobalt", headers), "1");
    assert.equal(await total(authors, "First article", headers), "1");
    assert.equal(await total(posts, "Quartz", headers), "2");
    assert.equal(
      (
        await request(
          "PUT",
          `/collections/${posts}/relations/tags/search`,
          { searchable: false },
          headers,
        )
      ).statusCode,
      403,
    );

    assert.equal(
      (
        await request("PATCH", `/permissions/${permissions[posts]}`, {
          fields: ["title"],
        })
      ).statusCode,
      200,
    );
    assert.equal(await total(posts, "Cobalt", headers), "0");
    assert.equal(await total(posts, "Quartz", headers), "0");
    assert.equal(await total(authors, "First article", headers), "0");
    assert.equal(
      (
        await request("PATCH", `/permissions/${permissions[posts]}`, {
          fields: ["title", "author_id", "tags"],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request("PATCH", `/permissions/${permissions[authors]}`, {
          fields: ["articles"],
        })
      ).statusCode,
      200,
    );
    assert.equal(await total(posts, "Cobalt", headers), "0");
    assert.equal(
      (
        await request("PATCH", `/permissions/${permissions[authors]}`, {
          fields: ["title", "articles"],
        })
      ).statusCode,
      200,
    );
    await configure(posts, "tags", false);
    assert.equal(await total(posts, "Quartz", headers), "0");
    assert.equal(
      (await request("GET", "/search?q=Quartz", undefined, headers))
        .json()
        .items.filter(
          (entry: { collection: string }) => entry.collection === posts,
        ).length,
      0,
    );
    await configure(posts, "tags", true);
    assert.equal(await total(posts, "Quartz", headers), "2");
    const disabledTarget = await request(
      "PUT",
      `/collections/${tags}/fields/title/search`,
      { searchable: false, indexed: false },
    );
    assert.equal(disabledTarget.statusCode, 200, disabledTarget.body);
    assert.equal(await total(posts, "Quartz", headers), "0");
    assert.equal(
      (await request("GET", "/search?q=Quartz", undefined, headers))
        .json()
        .items.filter(
          (entry: { collection: string }) => entry.collection === posts,
        ).length,
      0,
    );
    assert.equal(
      (
        await request("PUT", `/collections/${tags}/fields/title/search`, {
          searchable: true,
          indexed: false,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/permissions/${permissions[tags]}`,
        })
      ).statusCode,
      204,
    );
    assert.equal(await total(posts, "Quartz", headers), "0");
  } finally {
    for (const name of [junction, posts, authors, tags]) {
      await database.schema.withSchema("public").dropTableIfExists(name);
    }
    await database("asmblyr_collections")
      .withSchema("public")
      .whereIn("name", [junction, posts, authors, tags])
      .delete();
    if (policyId)
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id: policyId })
        .delete();
    if (readerId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: readerId })
        .delete();
    await app.close();
    await database.destroy();
  }
});
