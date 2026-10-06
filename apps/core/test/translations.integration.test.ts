import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { createClient } from "@asmblyr-collaborative/sdk";

test("translation API shares catalog permissions, excludes record/default values and supports SDK", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [
      {
        name: "locale-fixture",
        namespace: "locale",
        definition: {},
        endpoints: [],
        translations: {
          ru: { "panel.title": "Обсуждение" },
          en: { other: "Other" },
        },
      },
    ],
  });
  const [admin, member] = await db("asmblyr_users")
    .insert(
      [true, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}`,
  };
  const memberToken = (await issueUserTokens(db, member.id)).accessToken;
  const names = ["visible", "private"].map(
    (kind) => `test_i18n_${kind}_${randomUUID().slice(0, 8)}`,
  );
  const policies: string[] = [];
  t.after(async () => {
    await app.close();
    await db("asmblyr_policies").whereIn("id", policies).delete();
    for (const name of names) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await db("asmblyr_users").whereIn("id", [admin.id, member.id]).delete();
    await db.destroy();
  });
  async function call(
    method: "GET" | "POST" | "PATCH" | "PUT",
    url: string,
    payload?: object,
    status = 200,
    privileged = true,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: privileged
        ? headers
        : { authorization: `Bearer ${memberToken}` },
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json().data;
  }
  for (const name of names) {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text", defaultValue: "DEFAULT_SECRET" },
          { name: "secret", type: "text" },
        ],
      },
      201,
    );
    await call("PATCH", `/collections/${name}/settings`, {
      translations: {
        en: {
          label: name === names[0] ? "Articles" : "PRIVATE_COLLECTION_LABEL",
        },
      },
    });
    await call("PUT", `/collections/${name}/fields/title/presentation`, {
      label: "Заголовок",
      translations: {
        en: {
          label: "Title",
          description: "Help",
          placeholder: "Write a title",
        },
      },
    });
    await call("PUT", `/collections/${name}/fields/secret/presentation`, {
      translations: { en: { label: "PRIVATE_FIELD_LABEL" } },
    });
    await call("POST", `/items/${name}`, { title: "RECORD_SECRET" }, 201);
  }
  const policy = await call(
    "POST",
    "/policies",
    {
      name: `Locale ${randomUUID()}`,
      userIds: [member.id],
      permissions: [
        { collection: names[0], action: "read", fields: ["title"] },
      ],
    },
    201,
  );
  policies.push(policy.id);
  const anonymous = await app.inject({
    method: "GET",
    url: "/translations?locale=en",
  });
  assert.equal(anonymous.statusCode, 401);
  await call("GET", "/translations?locale=de", undefined, 400);
  await call("GET", "/translations?locale=en&other=1", undefined, 400);
  const result = await call(
    "GET",
    "/translations?locale=en",
    undefined,
    200,
    false,
  );
  assert.equal(result.core["appearance.ocean"], "Ocean");
  assert.equal(result.plugins.locale["panel.title"], "Обсуждение");
  assert.equal(result.schema[names[0]].label, "Articles");
  assert.equal(
    result.schema[names[0]].fields.title.placeholder,
    "Write a title",
  );
  assert.equal(result.schema[names[0]].fields.id.label, "ID");
  for (const hidden of [
    names[1],
    "PRIVATE_COLLECTION_LABEL",
    "PRIVATE_FIELD_LABEL",
    "DEFAULT_SECRET",
    "RECORD_SECRET",
  ]) {
    assert.ok(!JSON.stringify(result).includes(hidden), hidden);
  }
  assert.equal(result.schema[names[0]].fields.created_at, undefined);
  assert.equal(
    (await call("GET", "/translations")).schema[names[0]].fields.title.label,
    "Заголовок",
  );
  for (const translations of [
    { fr: { label: "Title" } },
    { en: { unknown: "x" } },
    { en: { label: "x".repeat(121) } },
    { en: { label: 1 } },
  ]) {
    await call(
      "PATCH",
      `/collections/${names[0]}/settings`,
      { translations },
      400,
    );
  }
  await call(
    "PATCH",
    `/collections/${names[0]}/settings`,
    { translations: {} },
    403,
    false,
  );
  await call("POST", "/presence", {
    clientId: randomUUID(),
    scope: { kind: "page", page: "/admin/settings/plugins" },
  });
  await call(
    "POST",
    "/presence",
    {
      clientId: randomUUID(),
      scope: { kind: "page", page: "/admin/settings/plugins" },
    },
    403,
    false,
  );
  const aliasPresence = await call("POST", "/presence", {
    clientId: randomUUID(),
    scope: { kind: "page", page: "/system-settings/plugins" },
  });
  assert.equal(aliasPresence.participants[0].views, 2);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const client = createClient({
    baseUrl: app.listeningOrigin,
    accessToken: memberToken,
  });
  assert.equal(
    (await client.translations.get("en")).data.schema[names[0]].fields.title
      .label,
    "Title",
  );
});

test("appearance patches merge independently and preserve legacy theme updates", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const users = await db("asmblyr_users")
    .insert([1, 2].map(() => ({ email: `${randomUUID()}@example.test` })))
    .returning("id");
  const tokens = await Promise.all(
    users.map((user) => issueUserTokens(db, user.id)),
  );
  t.after(async () => {
    await app.close();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((u) => u.id),
      )
      .delete();
    await db.destroy();
  });
  async function call(payload?: object, who = 0, status = 200) {
    const response = await app.inject({
      method: payload ? "PATCH" : "GET",
      url: "/users/me/preferences",
      headers: { authorization: `Bearer ${tokens[who].accessToken}` },
      payload,
    });
    assert.equal(response.statusCode, status, response.body);
    return response.json().data;
  }
  assert.deepEqual(await call(), {
    theme: null,
    style: "neutral",
    locale: "ru",
    timezone: null,
  });
  await Promise.all([call({ style: "ocean" }), call({ locale: "en" })]);
  await call({ theme: "dark" });
  assert.deepEqual(await call(), {
    theme: "dark",
    style: "ocean",
    locale: "en",
    timezone: null,
  });
  assert.deepEqual(await call(undefined, 1), {
    theme: null,
    style: "neutral",
    locale: "ru",
    timezone: null,
  });
  for (const bad of [
    {},
    { style: "unknown" },
    { locale: "fr" },
    { theme: null },
    { userId: users[1].id },
    { style: "coral", locale: "invalid" },
  ]) {
    await call(bad, 0, 400);
  }
  assert.equal((await call()).style, "ocean");
});
