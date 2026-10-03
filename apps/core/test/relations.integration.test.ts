import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("collection relations create foreign keys and expose readable reverse items", async () => {
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
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const authors = `test_authors_${suffix}`;
  const posts = `test_posts_${suffix}`;
  let memberId: string | undefined;
  let policyId: string | undefined;

  try {
    const authorCollection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name: authors,
        primaryKey: { name: "id", type: "serial" },
        fields: [{ name: "name", type: "text" }],
      },
    });
    assert.equal(authorCollection.statusCode, 201, authorCollection.body);
    const postCollection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name: posts, fields: [{ name: "title", type: "text" }] },
    });
    assert.equal(postCollection.statusCode, 201, postCollection.body);
    const relation = await app.inject({
      method: "POST",
      url: `/collections/${posts}/relations`,
      payload: { name: "author_id", targetCollection: authors, nullable: true },
    });
    assert.equal(relation.statusCode, 201, relation.body);
    assert.deepEqual(
      relation
        .json()
        .data.fields.find(
          (field: { name: string }) => field.name === "author_id",
        ),
      {
        name: "author_id",
        type: "relation",
        required: false,
        nullable: true,
        searchable: false,
        relation: {
          kind: "m2o",
          collection: authors,
          primaryKey: { name: "id", type: "serial" },
          onDelete: "restrict",
        },
      },
    );
    const duplicate = await app.inject({
      method: "POST",
      url: `/collections/${posts}/relations`,
      payload: { name: "author_id", targetCollection: authors },
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    const requiredRelation = await app.inject({
      method: "PATCH",
      url: `/collections/${posts}/fields/author_id`,
      payload: { required: true, nullable: true },
    });
    assert.equal(requiredRelation.statusCode, 200, requiredRelation.body);
    assert.equal(
      requiredRelation
        .json()
        .data.fields.find(
          (field: { name: string }) => field.name === "author_id",
        ).required,
      true,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/items/${posts}`,
          payload: { title: "Missing author" },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/collections/${posts}/fields/author_id`,
          payload: { required: false },
        })
      ).statusCode,
      200,
    );

    const author = await app.inject({
      method: "POST",
      url: `/items/${authors}`,
      payload: { name: "Ada" },
    });
    assert.equal(author.statusCode, 201, author.body);
    const authorId = author.json().data.id as number;
    const invalid = await app.inject({
      method: "POST",
      url: `/items/${posts}`,
      payload: { title: "Broken", author_id: authorId + 1000 },
    });
    assert.equal(invalid.statusCode, 409, invalid.body);
    const post = await app.inject({
      method: "POST",
      url: `/items/${posts}`,
      payload: { title: "First post", author_id: authorId },
    });
    assert.equal(post.statusCode, 201, post.body);
    const postId = post.json().data.id as string;
    assert.equal(post.json().data.author_id, authorId);
    const related = await app.inject({
      method: "GET",
      url: `/items/${authors}/${authorId}/related`,
    });
    assert.equal(related.statusCode, 200, related.body);
    assert.deepEqual(related.json().data, [
      {
        sourceCollection: posts,
        sourceField: "author_id",
        items: [{ id: postId, label: "First post" }],
        hasMore: false,
      },
    ]);

    const [member] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    memberId = member.id;
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, member.id)).accessToken}`,
    };
    const policy = await app.inject({
      method: "POST",
      url: "/policies",
      payload: { name: `Relation reader ${suffix}` },
    });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const addGrant = async (
      collection: string,
      action: string,
      fields: string[],
    ) => {
      const permission = await app.inject({
        method: "POST",
        url: "/permissions",
        payload: { collection, action, fields },
      });
      assert.equal(permission.statusCode, 201, permission.body);
      const permissionId = permission.json().data.id as string;
      const link = await app.inject({
        method: "PUT",
        url: `/policies/${policyId}/permissions/${permissionId}`,
      });
      assert.equal(link.statusCode, 204, link.body);
      return permissionId;
    };
    const targetRead = await addGrant(authors, "read", ["name"]);
    const assignment = await app.inject({
      method: "PUT",
      url: `/policies/${policyId}/users/${member.id}`,
    });
    assert.equal(assignment.statusCode, 204, assignment.body);
    const reverseUrl = `/items/${authors}/${authorId}/related`;
    const noSourceRead = await app.inject({
      method: "GET",
      url: reverseUrl,
      headers,
    });
    assert.deepEqual(noSourceRead.json().data, []);
    const sourceRead = await addGrant(posts, "read", ["title"]);
    const hiddenRelation = await app.inject({
      method: "GET",
      url: reverseUrl,
      headers,
    });
    assert.deepEqual(hiddenRelation.json().data, []);
    await addGrant(posts, "create", ["title", "author_id"]);
    const createWithTargetRead = await app.inject({
      method: "POST",
      url: `/items/${posts}`,
      headers,
      payload: { title: "Member post", author_id: authorId },
    });
    assert.equal(
      createWithTargetRead.statusCode,
      201,
      createWithTargetRead.body,
    );
    const updateRead = await app.inject({
      method: "PATCH",
      url: `/permissions/${sourceRead}`,
      payload: { fields: ["title", "author_id"] },
    });
    assert.equal(updateRead.statusCode, 200, updateRead.body);
    const visible = await app.inject({
      method: "GET",
      url: reverseUrl,
      headers,
    });
    assert.equal(visible.json().data[0].items.length, 2);
    const removeTargetRead = await app.inject({
      method: "DELETE",
      url: `/permissions/${targetRead}`,
    });
    assert.equal(removeTargetRead.statusCode, 204, removeTargetRead.body);
    assert.equal(
      (await app.inject({ method: "GET", url: reverseUrl, headers }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/items/${posts}`,
          headers,
          payload: { title: "Denied", author_id: authorId },
        })
      ).statusCode,
      403,
    );

    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/items/${authors}/${authorId}`,
        })
      ).statusCode,
      409,
    );
    const unlink = await app.inject({
      method: "PATCH",
      url: `/items/${posts}/${postId}`,
      payload: { author_id: null },
    });
    assert.equal(unlink.statusCode, 200, unlink.body);
    const memberPostId = createWithTargetRead.json().data.id as string;
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/items/${posts}/${memberPostId}`,
          payload: { author_id: null },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/items/${authors}/${authorId}`,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (await app.inject({ method: "DELETE", url: `/collections/${authors}` }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/collections/${posts}/fields/author_id`,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (await app.inject({ method: "DELETE", url: `/collections/${authors}` }))
        .statusCode,
      204,
    );
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(posts);
    await database.schema.withSchema("public").dropTableIfExists(authors);
    await database("asmblyr_collections")
      .withSchema("public")
      .whereIn("name", [posts, authors])
      .delete();
    if (policyId)
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id: policyId })
        .delete();
    if (memberId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: memberId })
        .delete();
    await app.close();
    await database.destroy();
  }
});
