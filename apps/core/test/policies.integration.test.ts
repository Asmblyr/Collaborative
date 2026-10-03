import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("policies manage collection actions and fields without item filters", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const name = `test_policy_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  let policyId: string | undefined;
  let sharedPolicyId: string | undefined;
  const userIds: string[] = [];

  try {
    const [admin] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: true })
      .returning<{ id: string }[]>("id");
    const [member] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    userIds.push(admin.id, member.id);
    const adminToken = (await issueUserTokens(database, admin.id)).accessToken;
    const memberToken = (await issueUserTokens(database, member.id))
      .accessToken;
    const authorization = `Bearer ${adminToken}`;

    assert.equal(
      (await app.inject({ method: "GET", url: "/policies" })).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/policies",
          headers: { authorization: `Bearer ${memberToken}` },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: "/permissions" })).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/permissions",
          headers: { authorization: `Bearer ${memberToken}` },
        })
      ).statusCode,
      403,
    );

    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      headers: { authorization },
      payload: {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);

    const created = await app.inject({
      method: "POST",
      url: "/policies",
      headers: { authorization },
      payload: { name: `Editors ${name}` },
    });
    assert.equal(created.statusCode, 201, created.body);
    policyId = created.json().data.id as string;
    const permission = (action: string, fields: string[]) => ({
      collection: name,
      action,
      fields,
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: { authorization },
      payload: permission("read", ["missing"]),
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    const invalidDelete = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: { authorization },
      payload: permission("delete", ["title"]),
    });
    assert.equal(invalidDelete.statusCode, 400, invalidDelete.body);

    const read = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: { authorization },
      payload: permission("read", ["title", "secret"]),
    });
    assert.equal(read.statusCode, 201, read.body);
    assert.deepEqual(read.json().data.fields, ["title", "secret"]);
    const readId = read.json().data.id as string;
    const duplicate = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: { authorization },
      payload: permission("read", ["title"]),
    });
    assert.equal(duplicate.statusCode, 201, duplicate.body);
    assert.deepEqual(duplicate.json().data.policyIds, []);
    const update = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: { authorization },
      payload: permission("update", ["title"]),
    });
    assert.equal(update.statusCode, 201, update.body);
    const updateId = update.json().data.id as string;
    for (const id of [readId, updateId]) {
      assert.equal(
        (
          await app.inject({
            method: "PUT",
            url: `/policies/${policyId}/permissions/${id}`,
            headers: { authorization },
          })
        ).statusCode,
        204,
      );
    }
    const invalidPatch = await app.inject({
      method: "PATCH",
      url: `/permissions/${readId}`,
      headers: { authorization },
      payload: { fields: ["missing"] },
    });
    assert.equal(invalidPatch.statusCode, 400, invalidPatch.body);
    const patched = await app.inject({
      method: "PATCH",
      url: `/permissions/${readId}`,
      headers: { authorization },
      payload: { fields: ["secret", "title"] },
    });
    assert.equal(patched.statusCode, 200, patched.body);
    const fetched = await app.inject({
      method: "GET",
      url: `/permissions/${readId}`,
      headers: { authorization },
    });
    assert.deepEqual(fetched.json().data.policyIds, [policyId]);
    assert.deepEqual(fetched.json().data.fields, ["secret", "title"]);
    const listed = await app.inject({
      method: "GET",
      url: `/permissions?policyId=${policyId}`,
      headers: { authorization },
    });
    assert.deepEqual(
      listed.json().data.map((entry: { id: string }) => entry.id),
      [readId, updateId],
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/permissions/${name}/read`,
          headers: { authorization },
          payload: { fields: ["*"] },
        })
      ).statusCode,
      404,
    );

    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/users/${member.id}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    const detail = await app.inject({
      method: "GET",
      url: `/policies/${policyId}`,
      headers: { authorization },
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().data.permissions.length, 2);
    assert.equal(detail.json().data.users[0].id, member.id);
    const effective = await app.inject({
      method: "GET",
      url: "/permissions/me",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    assert.equal(effective.statusCode, 200, effective.body);
    assert.deepEqual(effective.json().data, {
      superuser: false,
      permissions: [
        { collection: name, action: "read", fields: ["secret", "title"] },
        { collection: name, action: "update", fields: ["title"] },
      ],
    });

    const sharedPolicy = await app.inject({
      method: "POST",
      url: "/policies",
      headers: { authorization },
      payload: { name: `Shared ${name}` },
    });
    assert.equal(sharedPolicy.statusCode, 201, sharedPolicy.body);
    sharedPolicyId = sharedPolicy.json().data.id as string;
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${sharedPolicyId}/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${sharedPolicyId}/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${sharedPolicyId}/users/${member.id}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    const shared = await app.inject({
      method: "GET",
      url: `/permissions/${readId}`,
      headers: { authorization },
    });
    assert.deepEqual(
      shared.json().data.policyIds.sort(),
      [policyId, sharedPolicyId].sort(),
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/permissions/${readId}`,
          headers: { authorization },
          payload: { fields: ["title"] },
        })
      ).statusCode,
      200,
    );
    for (const id of [policyId, sharedPolicyId]) {
      const detail = await app.inject({
        method: "GET",
        url: `/policies/${id}`,
        headers: { authorization },
      });
      assert.deepEqual(
        detail
          .json()
          .data.permissions.find((entry: { id: string }) => entry.id === readId)
          .fields,
        ["title"],
      );
    }
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/permissions/${readId}`,
          headers: { authorization },
          payload: { fields: ["secret", "title"] },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/policies/${policyId}/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: "/permissions/me",
          headers: { authorization: `Bearer ${memberToken}` },
        })
      ).json().data.permissions,
      [
        { collection: name, action: "read", fields: ["secret", "title"] },
        { collection: name, action: "update", fields: ["title"] },
      ],
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/policies/${sharedPolicyId}/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/permissions/${readId}`,
          headers: { authorization },
        })
      ).statusCode,
      200,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: `/policies/${policyId}`,
          headers: { authorization },
        })
      )
        .json()
        .data.permissions.map((entry: { id: string }) => entry.id),
      [readId, updateId],
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/policies/${sharedPolicyId}`,
          headers: { authorization },
        })
      ).statusCode,
      204,
    );
    sharedPolicyId = undefined;
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: `/permissions/${readId}`,
          headers: { authorization },
        })
      ).json().data.policyIds,
      [policyId],
    );

    const dropped = await app.inject({
      method: "DELETE",
      url: `/collections/${name}/fields/secret`,
      headers: { authorization },
    });
    assert.equal(dropped.statusCode, 204, dropped.body);
    const afterDrop = await app.inject({
      method: "GET",
      url: `/policies/${policyId}`,
      headers: { authorization },
    });
    assert.deepEqual(
      afterDrop
        .json()
        .data.permissions.find(
          (entry: { action: string }) => entry.action === "read",
        ).fields,
      ["title"],
    );
    const recreatedField = await app.inject({
      method: "POST",
      url: `/collections/${name}/fields`,
      headers: { authorization },
      payload: { name: "secret", type: "text" },
    });
    assert.equal(recreatedField.statusCode, 201, recreatedField.body);
    const afterRecreate = await app.inject({
      method: "GET",
      url: `/policies/${policyId}`,
      headers: { authorization },
    });
    assert.deepEqual(
      afterRecreate
        .json()
        .data.permissions.find(
          (entry: { action: string }) => entry.action === "read",
        ).fields,
      ["title"],
    );

    const removedPermission = await app.inject({
      method: "DELETE",
      url: `/permissions/${updateId}`,
      headers: { authorization },
    });
    assert.equal(removedPermission.statusCode, 204, removedPermission.body);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/permissions/${updateId}`,
          headers: { authorization },
        })
      ).statusCode,
      404,
    );
    const unassigned = await app.inject({
      method: "DELETE",
      url: `/policies/${policyId}/users/${member.id}`,
      headers: { authorization },
    });
    assert.equal(unassigned.statusCode, 204, unassigned.body);
    const afterUnassign = await app.inject({
      method: "GET",
      url: "/permissions/me",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    assert.deepEqual(afterUnassign.json().data.permissions, []);

    const removed = await app.inject({
      method: "DELETE",
      url: `/collections/${name}`,
      headers: { authorization },
    });
    assert.equal(removed.statusCode, 204, removed.body);
    const afterCollectionDrop = await app.inject({
      method: "GET",
      url: `/policies/${policyId}`,
      headers: { authorization },
    });
    assert.deepEqual(afterCollectionDrop.json().data.permissions, []);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .delete();
    if (policyId)
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id: policyId })
        .delete();
    if (sharedPolicyId)
      await database("asmblyr_policies")
        .withSchema("public")
        .where({ id: sharedPolicyId })
        .delete();
    if (userIds.length > 0)
      await database("asmblyr_users")
        .withSchema("public")
        .whereIn("id", userIds)
        .delete();
    await database.destroy();
    await app.close();
  }
});
