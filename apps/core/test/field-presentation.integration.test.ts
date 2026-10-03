import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import type { Collection } from "../src/collections/types.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("field presentation persists without changing schema, validation, search or field grants", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_presentation_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const target = `${name}_target`;
  let memberId: string | undefined, policyId: string | undefined;
  const put = (field: string, payload: object, collection = name) =>
    app.inject({
      method: "PUT",
      url: `/collections/${collection}/fields/${field}/presentation`,
      payload,
    });
  const catalog = async () =>
    (await app.inject({ method: "GET", url: "/collections" })).json()
      .data as Collection[];
  try {
    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          {
            name: "title",
            type: "text",
            required: true,
            nullable: true,
            defaultValue: "Draft",
            searchable: false,
          },
          { name: "email", type: "email" },
          { name: "count", type: "integer" },
        ],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/collections",
          payload: { name: target },
        })
      ).statusCode,
      201,
    );
    const item = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: {},
    });
    assert.equal(item.statusCode, 201, item.body);
    const settings = {
      label: "Описание",
      description: "Текст для читателя",
      placeholder: "Введите текст",
      interface: "textarea",
      width: "half",
      order: -1,
      group: "Основное",
    };
    const saved = await put("title", settings);
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().data, settings);
    const field = (await catalog())
      .find((c) => c.name === name)!
      .fields.find((f) => f.name === "title")!;
    assert.deepEqual(field.presentation, settings);
    assert.equal(field.required, true);
    assert.equal(field.nullable, true);
    assert.equal(field.defaultValue, "Draft");
    assert.equal(field.searchable, false);
    assert.equal(field.type, "text");
    const unchanged = await app.inject({
      method: "GET",
      url: `/items/${name}/${item.json().data.id}`,
    });
    assert.equal(unchanged.json().data.title, "Draft");
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/items/${name}/${item.json().data.id}`,
          payload: { title: null },
        })
      ).statusCode,
      400,
    );
    for (const payload of [
      { interface: "textarea" },
      { interface: ["auto"] },
      { order: 1.5 },
      { order: 10001 },
      { label: "x".repeat(121) },
      { width: "quarter" },
      { html: "<script>" },
      { type: "text" },
    ]) {
      assert.equal((await put("count", payload)).statusCode, 400);
    }
    assert.equal(
      (await put("email", { interface: "textarea" })).statusCode,
      400,
    );
    assert.equal((await put("id", settings)).statusCode, 400);
    assert.equal((await put("missing", settings)).statusCode, 404);
    assert.equal(
      (await put("email", settings, "asmblyr_users")).statusCode,
      403,
    );

    const relation = await app.inject({
      method: "POST",
      url: `/collections/${name}/relations`,
      payload: {
        kind: "m2o",
        name: "parent",
        targetCollection: target,
        reverseField: "children",
        nullable: true,
      },
    });
    assert.equal(relation.statusCode, 201, relation.body);
    assert.equal((await put("parent", { interface: "input" })).statusCode, 400);
    assert.equal(
      (await put("children", { label: "Материалы", order: 5 }, target))
        .statusCode,
      200,
    );
    assert.equal(
      (await catalog()).find((c) => c.name === target)!.fields[0].presentation
        ?.label,
      "Материалы",
    );

    const [member] = await database("asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test` })
      .returning("id");
    memberId = member.id;
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(database, member.id)).accessToken}`,
    };
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/collections/${name}/fields/title/presentation`,
          headers,
          payload: settings,
        })
      ).statusCode,
      403,
    );
    const policy = await app.inject({
      method: "POST",
      url: "/policies",
      payload: { name },
    });
    policyId = policy.json().data.id;
    const permission = await app.inject({
      method: "POST",
      url: "/permissions",
      payload: { collection: name, action: "read", fields: ["email"] },
    });
    assert.equal(permission.statusCode, 201, permission.body);
    await app.inject({
      method: "PUT",
      url: `/policies/${policyId}/permissions/${permission.json().data.id}`,
    });
    await app.inject({
      method: "PUT",
      url: `/policies/${policyId}/users/${memberId}`,
    });
    const visible = await app.inject({
      method: "GET",
      url: "/collections",
      headers,
    });
    assert.deepEqual(
      visible.json().data[0].fields.map((f: { name: string }) => f.name),
      ["email"],
    );

    assert.equal((await put("title", {})).statusCode, 200);
    assert.equal(
      (await catalog()).find((c) => c.name === name)!.fields[0].presentation,
      undefined,
    );
    await put("email", { label: "Contact" });
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/collections/${name}/fields/email`,
        })
      ).statusCode,
      204,
    );
    await app.inject({
      method: "POST",
      url: `/collections/${name}/fields`,
      payload: { name: "email", type: "email" },
    });
    assert.equal(
      (await catalog())
        .find((c) => c.name === name)!
        .fields.find((f) => f.name === "email")?.presentation,
      undefined,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/collections/${name}/fields/parent`,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (await catalog()).find((c) => c.name === target)!.fields.length,
      0,
    );
  } finally {
    for (const collection of [name, target]) {
      await database.schema.withSchema("public").dropTableIfExists(collection);
      await database("asmblyr_collections")
        .where({ name: collection })
        .delete();
      await database("asmblyr_item_events")
        .where({ collection_name: collection })
        .delete();
    }
    if (policyId)
      await database("asmblyr_policies").where({ id: policyId }).delete();
    if (memberId)
      await database("asmblyr_users").where({ id: memberId }).delete();
    await app.close();
    await database.destroy();
  }
});
