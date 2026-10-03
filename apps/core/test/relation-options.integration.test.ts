import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("relation designer creates inverse aliases and a named many-to-many junction", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const authors = `test_authors_${suffix}`;
  const posts = `test_posts_${suffix}`;
  const tags = `test_tags_${suffix}`;
  const junction = `test_post_tags_${suffix}`;
  let memberId: string | undefined;
  let policyId: string | undefined;
  try {
    for (const name of [authors, posts, tags]) {
      const result = await app.inject({ method: "POST", url: "/collections",
        payload: { name, primaryKey: { name: "id", type: "serial" },
          fields: [{ name: "title", type: "text" }] } });
      assert.equal(result.statusCode, 201, result.body);
    }
    const m2o = await app.inject({ method: "POST", url: `/collections/${posts}/relations`,
      payload: { kind: "m2o", name: "author_id", targetCollection: authors,
        reverseField: "articles", onDelete: "setNull", nullable: true } });
    assert.equal(m2o.statusCode, 201, m2o.body);
    assert.equal(m2o.json().data.fields.find((field: { name: string }) =>
      field.name === "author_id").relation.onDelete, "setNull");
    const reuse = await app.inject({ method: "POST", url: `/collections/${authors}/relations`,
      payload: { kind: "o2m", name: "published_articles", targetCollection: posts,
        foreignKey: "author_id", reuseExisting: true } });
    assert.equal(reuse.statusCode, 201, reuse.body);
    const duplicateAlias = await app.inject({ method: "POST", url: `/collections/${authors}/relations`,
      payload: { kind: "o2m", name: "articles", targetCollection: posts,
        foreignKey: "author_id", reuseExisting: true } });
    assert.equal(duplicateAlias.statusCode, 409, duplicateAlias.body);
    const o2m = await app.inject({ method: "POST", url: `/collections/${authors}/relations`,
      payload: { kind: "o2m", name: "edited_articles", targetCollection: posts,
        foreignKey: "editor_id", onDelete: "setNull", nullable: true } });
    assert.equal(o2m.statusCode, 201, o2m.body);
    assert.equal(o2m.json().data.fields.find((field: { name: string }) =>
      field.name === "edited_articles").relation.throughField, "editor_id");
    assert.equal(await database.schema.withSchema("public").hasColumn(posts, "editor_id"), true);

    const m2m = await app.inject({ method: "POST", url: `/collections/${posts}/relations`,
      payload: { kind: "m2m", name: "tags", targetCollection: tags,
        junctionCollection: junction, sourceKey: "post_id", targetKey: "tag_id",
        reverseField: "articles" } });
    assert.equal(m2m.statusCode, 201, m2m.body);
    const junctionMetadata = await database("asmblyr_collections").withSchema("public")
      .where({ name: junction }).first("primary_key_type");
    assert.equal(junctionMetadata.primary_key_type, "bigserial");
    const alias = m2m.json().data.fields.find((field: { name: string }) => field.name === "tags");
    assert.deepEqual(alias.relation, { kind: "m2m", collection: tags,
      throughCollection: junction, throughField: "post_id", relatedField: "tag_id" });

    const author = await app.inject({ method: "POST", url: `/items/${authors}`,
      payload: { title: "Ada" } });
    const post = await app.inject({ method: "POST", url: `/items/${posts}`,
      payload: { title: "Article", author_id: author.json().data.id } });
    const tag = await app.inject({ method: "POST", url: `/items/${tags}`,
      payload: { title: "Research" } });
    const fallback = await app.inject({ method: "POST", url: `/items/${authors}`,
      payload: { title: "Fallback" } });
    const reviewer = await app.inject({ method: "POST", url: `/items/${authors}`,
      payload: { title: "Reviewer" } });
    const defaultRelation = await app.inject({ method: "POST", url: `/collections/${posts}/relations`,
      payload: { kind: "m2o", name: "reviewer_id", targetCollection: authors,
        onDelete: "setDefault", defaultValue: String(fallback.json().data.id), nullable: false } });
    assert.equal(defaultRelation.statusCode, 201, defaultRelation.body);
    assert.equal(defaultRelation.json().data.fields.find((field: { name: string }) =>
      field.name === "reviewer_id").defaultValue, String(fallback.json().data.id));
    const backfilledPost = await app.inject({ method: "GET",
      url: `/items/${posts}/${post.json().data.id}` });
    assert.equal(String(backfilledPost.json().data.reviewer_id), String(fallback.json().data.id));
    assert.equal((await app.inject({ method: "PATCH", url: `/items/${posts}/${post.json().data.id}`,
      payload: { reviewer_id: reviewer.json().data.id } })).statusCode, 200);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/items/${authors}/${reviewer.json().data.id}` })).statusCode, 204);
    const defaultedPost = await app.inject({ method: "GET",
      url: `/items/${posts}/${post.json().data.id}` });
    assert.equal(String(defaultedPost.json().data.reviewer_id), String(fallback.json().data.id));
    for (let index = 0; index < 2; index++) {
      const link = await app.inject({ method: "POST", url: `/items/${junction}`,
        payload: { post_id: post.json().data.id, tag_id: tag.json().data.id } });
      assert.equal(link.statusCode, index === 0 ? 201 : 409, link.body);
    }
    const related = await app.inject({ method: "GET",
      url: `/items/${posts}/${post.json().data.id}/related` });
    assert.equal(related.statusCode, 200, related.body);
    assert.deepEqual(related.json().data.find((group: { aliasName?: string }) =>
      group.aliasName === "tags").items,
    [{ id: String(tag.json().data.id), label: "Research" }]);
    const [member] = await database("asmblyr_users").withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    memberId = member.id;
    const headers = { authorization: `Bearer ${(await issueUserTokens(database, member.id)).accessToken}` };
    const policy = await app.inject({ method: "POST", url: "/policies",
      payload: { name: `Relation viewer ${suffix}` } });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const postRead = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: posts, action: "read", fields: ["title"] } });
    const tagRead = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: tags, action: "read", fields: ["title"] } });
    for (const permission of [postRead, tagRead]) {
      assert.equal(permission.statusCode, 201, permission.body);
      assert.equal((await app.inject({ method: "PUT",
        url: `/policies/${policyId}/permissions/${permission.json().data.id}` })).statusCode, 204);
    }
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/users/${member.id}` })).statusCode, 204);
    const relatedUrl = `/items/${posts}/${post.json().data.id}/related`;
    const hidden = await app.inject({ method: "GET", url: relatedUrl, headers });
    assert.equal(hidden.statusCode, 200, hidden.body);
    assert.equal(hidden.json().data.some((group: { aliasName?: string }) => group.aliasName === "tags"), false);
    assert.equal((await app.inject({ method: "PATCH", url: `/permissions/${postRead.json().data.id}`,
      payload: { fields: ["title", "tags"] } })).statusCode, 200);
    const visible = await app.inject({ method: "GET", url: relatedUrl, headers });
    assert.equal(visible.json().data.find((group: { aliasName?: string }) =>
      group.aliasName === "tags").items.length, 1);
    const reverseAliasGrant = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: authors, action: "read", fields: ["edited_articles"] } });
    assert.equal(reverseAliasGrant.statusCode, 201, reverseAliasGrant.body);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/collections/${posts}/fields/editor_id` })).statusCode, 204);
    assert.equal(await database("asmblyr_permissions").withSchema("public")
      .where({ id: reverseAliasGrant.json().data.id }).first("id"), undefined);
    const aliasGrant = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: posts, action: "read", fields: ["tags"] } });
    assert.equal(aliasGrant.statusCode, 201, aliasGrant.body);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/items/${authors}/${author.json().data.id}` })).statusCode, 204);
    const updatedPost = await app.inject({ method: "GET",
      url: `/items/${posts}/${post.json().data.id}` });
    assert.equal(updatedPost.json().data.author_id, null);
    const impact = await app.inject({ method: "GET",
      url: `/collections/${posts}/fields/tags/impact` });
    assert.equal(impact.json().data.virtual, true);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/collections/${posts}/fields/tags` })).statusCode, 204);
    assert.equal(await database("asmblyr_permissions").withSchema("public")
      .where({ id: aliasGrant.json().data.id }).first("id"), undefined);
    const links = await database(junction).withSchema("public").count("* as count");
    assert.equal(Number(links[0].count), 1);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/items/${posts}/${post.json().data.id}` })).statusCode, 204);
    const remainingLinks = await database(junction).withSchema("public").count("* as count");
    assert.equal(Number(remainingLinks[0].count), 0);
    const reverseGrant = await app.inject({ method: "POST", url: "/permissions",
      payload: { collection: tags, action: "read", fields: ["articles"] } });
    assert.equal(reverseGrant.statusCode, 201, reverseGrant.body);
    assert.equal((await app.inject({ method: "DELETE",
      url: `/collections/${junction}` })).statusCode, 204);
    assert.equal(await database("asmblyr_permissions").withSchema("public")
      .where({ id: reverseGrant.json().data.id }).first("id"), undefined);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(junction);
    await database.schema.withSchema("public").dropTableIfExists(posts);
    await database.schema.withSchema("public").dropTableIfExists(tags);
    await database.schema.withSchema("public").dropTableIfExists(authors);
    await database("asmblyr_collections").withSchema("public")
      .whereIn("name", [junction, posts, tags, authors]).delete();
    if (policyId) await database("asmblyr_policies").withSchema("public").where({ id: policyId }).delete();
    if (memberId) await database("asmblyr_users").withSchema("public").where({ id: memberId }).delete();
    await app.close();
    await database.destroy();
  }
});
