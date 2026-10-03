import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("collection grants protect items, fields, history and structure", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const name = `test_access_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const users: string[] = [];
  const extraPolicies: string[] = [];
  let policyId: string | undefined;

  try {
    const [admin] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: true })
      .returning<{ id: string }[]>("id");
    const [member] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    users.push(admin.id, member.id);
    const adminAuth = `Bearer ${(await issueUserTokens(database, admin.id)).accessToken}`;
    const memberAuth = `Bearer ${(await issueUserTokens(database, member.id)).accessToken}`;
    const adminHeaders = { authorization: adminAuth };
    const memberHeaders = { authorization: memberAuth };

    assert.equal(
      (await app.inject({ method: "GET", url: `/users/${member.id}/access` }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/users/${member.id}/access`,
          headers: memberHeaders,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/users/not-a-uuid/access",
          headers: adminHeaders,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/users/${randomUUID()}/access`,
          headers: adminHeaders,
        })
      ).statusCode,
      404,
    );
    const adminAccess = await app.inject({
      method: "GET",
      url: `/users/${admin.id}/access`,
      headers: adminHeaders,
    });
    assert.equal(adminAccess.statusCode, 200, adminAccess.body);
    assert.equal(adminAccess.json().data.user.superuser, true);
    assert.deepEqual(adminAccess.json().data.permissions, []);

    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      headers: adminHeaders,
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
      url: `/items/${name}`,
      headers: adminHeaders,
      payload: { title: "Public", secret: "hidden" },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;

    assert.equal(
      (await app.inject({ method: "GET", url: "/collections" })).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: `/items/${name}` })).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: `/item-events/${name}` }))
        .statusCode,
      401,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: "/collections",
          headers: memberHeaders,
        })
      ).json().data,
      [],
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}`,
          headers: memberHeaders,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/collections",
          headers: memberHeaders,
          payload: { name: `${name}_other` },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/collections/${name}`,
          headers: memberHeaders,
        })
      ).statusCode,
      403,
    );

    const [writer] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    users.push(writer.id);
    const writerAuth = `Bearer ${(await issueUserTokens(database, writer.id)).accessToken}`;
    const writerPolicy = await app.inject({
      method: "POST",
      url: "/policies",
      headers: adminHeaders,
      payload: { name: `Writer ${name}` },
    });
    const writerPolicyId = writerPolicy.json().data.id as string;
    extraPolicies.push(writerPolicyId);
    const writerGrant = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: adminHeaders,
      payload: { collection: name, action: "create", fields: ["title"] },
    });
    assert.equal(writerGrant.statusCode, 201, writerGrant.body);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${writerPolicyId}/permissions/${writerGrant.json().data.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${writerPolicyId}/users/${writer.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    const writeOnly = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      headers: { authorization: writerAuth },
      payload: { title: "Write only" },
    });
    assert.equal(writeOnly.statusCode, 201, writeOnly.body);
    assert.equal(writeOnly.json().data, null);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}`,
          headers: { authorization: writerAuth },
        })
      ).statusCode,
      403,
    );

    const policy = await app.inject({
      method: "POST",
      url: "/policies",
      headers: adminHeaders,
      payload: { name: `Reader ${name}` },
    });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const grant = async (action: string, fields: string[]) => {
      const created = await app.inject({
        method: "POST",
        url: "/permissions",
        headers: adminHeaders,
        payload: { collection: name, action, fields },
      });
      if (created.statusCode === 201) {
        assert.equal(
          (
            await app.inject({
              method: "PUT",
              url: `/policies/${policyId}/permissions/${created.json().data.id}`,
              headers: adminHeaders,
            })
          ).statusCode,
          204,
        );
      }
      return created;
    };
    assert.equal((await grant("read", ["title"])).statusCode, 201);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/users/${member.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );

    const catalog = await app.inject({
      method: "GET",
      url: "/collections",
      headers: memberHeaders,
    });
    assert.deepEqual(
      catalog.json().data.map((entry: { name: string }) => entry.name),
      [name],
    );
    assert.deepEqual(
      catalog
        .json()
        .data[0].fields.map((field: { name: string }) => field.name),
      ["title"],
    );
    const items = await app.inject({
      method: "GET",
      url: `/items/${name}`,
      headers: memberHeaders,
    });
    assert.equal(items.json().data.length, 2);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}?sort=secret`,
          headers: memberHeaders,
        })
      ).statusCode,
      403,
    );
    assert.ok(
      items
        .json()
        .data.every(
          (entry: Record<string, unknown>) =>
            Object.keys(entry).sort().join(",") === "id,title",
        ),
    );
    assert.ok(
      items
        .json()
        .data.some(
          (entry: { id: string; title: string }) =>
            entry.id === id && entry.title === "Public",
        ),
    );
    const item = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
      headers: memberHeaders,
    });
    assert.deepEqual(item.json().data, { id, title: "Public" });
    const secondPolicy = await app.inject({
      method: "POST",
      url: "/policies",
      headers: adminHeaders,
      payload: { name: `Secret reader ${name}` },
    });
    const secondPolicyId = secondPolicy.json().data.id as string;
    extraPolicies.push(secondPolicyId);
    const secondGrant = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: adminHeaders,
      payload: { collection: name, action: "read", fields: ["secret"] },
    });
    assert.equal(secondGrant.statusCode, 201, secondGrant.body);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${secondPolicyId}/permissions/${secondGrant.json().data.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${secondPolicyId}/users/${member.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    const combined = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
      headers: memberHeaders,
    });
    assert.deepEqual(combined.json().data, {
      id,
      title: "Public",
      secret: "hidden",
    });
    const memberAccess = await app.inject({
      method: "GET",
      url: `/users/${member.id}/access`,
      headers: adminHeaders,
    });
    assert.equal(memberAccess.statusCode, 200, memberAccess.body);
    assert.deepEqual(
      memberAccess
        .json()
        .data.policies.map((entry: { id: string }) => entry.id)
        .sort(),
      [policyId, secondPolicyId].sort(),
    );
    assert.deepEqual(memberAccess.json().data.permissions, [
      { collection: name, action: "read", fields: ["secret", "title"] },
    ]);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/policies/${secondPolicyId}/users/${member.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}/${id}`,
          headers: memberHeaders,
        })
      ).json().data,
      { id, title: "Public" },
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/items/${name}`,
          headers: memberHeaders,
          payload: { title: "Denied" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/items/${name}/${id}`,
          headers: memberHeaders,
          payload: { title: "Denied" },
        })
      ).statusCode,
      403,
    );

    const hiddenChange = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      headers: adminHeaders,
      payload: { secret: "still hidden" },
    });
    assert.equal(hiddenChange.statusCode, 200, hiddenChange.body);
    const history = await app.inject({
      method: "GET",
      url: `/item-events/${name}`,
      headers: memberHeaders,
    });
    assert.equal(history.statusCode, 200, history.body);
    assert.equal(history.json().data.length, 2);
    assert.ok(
      history
        .json()
        .data.some(
          (event: { after: { title?: string } }) =>
            event.after.title === "Public",
        ),
    );
    assert.ok(!history.body.includes("hidden"));

    assert.equal((await grant("update", ["title"])).statusCode, 201);
    const deniedField = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      headers: memberHeaders,
      payload: { secret: "leak" },
    });
    assert.equal(deniedField.statusCode, 403, deniedField.body);
    const updated = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      headers: memberHeaders,
      payload: { title: "Changed" },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.deepEqual(updated.json().data, { id, title: "Changed" });
    const memberHistory = await app.inject({
      method: "GET",
      url: `/item-events/${name}`,
      headers: memberHeaders,
    });
    assert.equal(memberHistory.json().data[0].actor_id, member.id);
    assert.ok(!memberHistory.body.includes("still hidden"));

    assert.equal((await grant("create", ["title"])).statusCode, 201);
    const memberCreated = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      headers: memberHeaders,
      payload: { title: "Created" },
    });
    assert.equal(memberCreated.statusCode, 201, memberCreated.body);
    assert.deepEqual(Object.keys(memberCreated.json().data).sort(), [
      "id",
      "title",
    ]);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/items/${name}`,
          headers: memberHeaders,
          payload: { title: "No", secret: "No" },
        })
      ).statusCode,
      403,
    );
    assert.equal((await grant("delete", ["*"])).statusCode, 201);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/items/${name}/${memberCreated.json().data.id}`,
          headers: memberHeaders,
        })
      ).statusCode,
      204,
    );

    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/policies/${policyId}/users/${member.id}`,
          headers: adminHeaders,
        })
      ).statusCode,
      204,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: "GET",
          url: "/collections",
          headers: memberHeaders,
        })
      ).json().data,
      [],
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}`,
          headers: memberHeaders,
        })
      ).statusCode,
      403,
    );
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
    if (extraPolicies.length)
      await database("asmblyr_policies")
        .withSchema("public")
        .whereIn("id", extraPolicies)
        .delete();
    if (users.length)
      await database("asmblyr_users")
        .withSchema("public")
        .whereIn("id", users)
        .delete();
    await app.close();
    await database.destroy();
  }
});
