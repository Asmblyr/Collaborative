import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { materializedFixture } from "./support/materialized-fixture.js";
import {
  createContextTools,
  validateFilterProposal,
} from "../src/assistant/context-tools.js";
import {
  parseAssistantContext,
  type AssistantContext,
} from "../src/assistant/context-input.js";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import type { AssistantInput } from "../src/assistant/validation.js";
import type { Access } from "../src/permissions/access.js";
import { compileRowFilter } from "../src/permissions/row-filter.js";
import { collectionSchema } from "../src/items/schema-repository.js";

const recordContext = (collection: string, id = "1"): AssistantContext => ({
  page: "items",
  workspaceId: null,
  collection,
  record: { id },
});

test("record context accepts only an identifier and cannot carry a draft or table scope", () => {
  const context = recordContext("articles", "text:key/1");
  assert.deepEqual(parseAssistantContext(context), context);
  for (const invalid of [
    { ...context, record: { id: "1", values: { secret: "forged" } } },
    { ...context, table: {} },
    { ...context, record: { id: "" } },
    { ...context, record: { id: "\0" } },
    { ...context, record: { id: "x".repeat(256) } },
    { ...context, page: "home" },
    { ...context, collection: "asmblyr_users" },
  ]) {
    assert.throws(() => parseAssistantContext(invalid));
  }
});

test("saved record context enforces row/MCP grants, isolates model history and rechecks tool access", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const inputs: AssistantInput[] = [];
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    assistant: new AssistantService(config, async (input) => {
      inputs.push(input);
      return { content: "Saved record answer", truncated: false };
    }),
  });
  const owner = await authorizeTestApp(app, db);
  const name = `test_ai_record_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let current: Access = {
    principal: { id: owner.id, kind: "user", superuser: false },
    grants: new Map([[`${name}:read`, ["title"]]]),
  };
  try {
    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        primaryKey: { name: "id", type: "serial" },
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    await db(name).insert([
      { title: "Visible", secret: "never-send-secret" },
      { title: "Hidden", secret: "never-send-other-record" },
    ]);
    const schema = await collectionSchema(db, name);
    current.rowRules = new Map([
      [
        `${name}:read`,
        [
          {
            fields: ["title"],
            filter: compileRowFilter(
              {
                logic: "and",
                children: [
                  {
                    field: "title",
                    op: "eq",
                    value: { kind: "literal", value: "Visible" },
                  },
                ],
              },
              name,
              schema,
              {},
            ),
          },
        ],
      ],
    ]);

    const tools = (await createContextTools(
      db,
      current,
      recordContext(name),
      async () => current,
    ))!;
    assert.deepEqual((tools.context as { record: object }).record, {
      id: "1",
      saved: true,
    });
    assert.ok(!JSON.stringify(tools.context).includes("Visible"));
    assert.ok(!JSON.stringify(tools.context).includes("secret"));
    assert.ok(
      !tools.definitions.some((tool) => tool.name === "propose_filter"),
    );
    await tools.execute("describe_collection", {});
    const read = await tools.execute("read_item", {
      id: "1",
      fields: ["title"],
    });
    assert.match(JSON.stringify(read), /Visible/);
    assert.ok(!JSON.stringify(read).includes("never-send-secret"));
    assert.ok(
      "error" in
        (await tools.execute("read_item", { id: "1", fields: ["secret"] })),
    );
    for (const id of ["2", "999"]) {
      await assert.rejects(
        createContextTools(
          db,
          current,
          recordContext(name, id),
          async () => current,
        ),
        { statusCode: 404 },
      );
    }
    await assert.rejects(
      createContextTools(
        db,
        current,
        recordContext(name, "bad-id"),
        async () => current,
      ),
      { statusCode: 400 },
    );
    await assert.rejects(
      validateFilterProposal(db, current, {
        context: recordContext(name),
        collectionId: schema.settings.internalId,
        filter: { logic: "and", children: [] },
      }),
      { statusCode: 400 },
    );
    current = { ...current, grants: new Map(), rowRules: new Map() };
    assert.ok(
      "error" in
        (await tools.execute("read_item", { id: "1", fields: ["title"] })),
    );
    await assert.rejects(
      createContextTools(db, current, recordContext(name), async () => current),
      { statusCode: 403 },
    );

    await db("asmblyr_collections")
      .where({ name })
      .update({ mcp_enabled: false });
    const admin: Access = {
      principal: { ...current.principal, superuser: true },
      grants: new Map(),
    };
    const disabled = await createContextTools(
      db,
      admin,
      recordContext(name),
      async () => admin,
    );
    assert.equal(disabled?.definitions.length, 0);
    assert.ok(!JSON.stringify(disabled?.context).includes('"record"'));
    await db("asmblyr_collections")
      .where({ name })
      .update({ mcp_enabled: true });

    const session = await app.inject({
      method: "POST",
      url: "/assistant/conversations",
      payload: {},
    });
    assert.equal(session.statusCode, 201, session.body);
    const conversationId = session.json().data.id;
    async function send(id: string, content: string) {
      const response = await app.inject({
        method: "POST",
        url: "/assistant/messages",
        payload: {
          conversationId,
          messageId: randomUUID(),
          content,
          context: recordContext(name, id),
        },
      });
      assert.equal(response.statusCode, 200, response.body);
    }
    await send("1", "Record one question");
    await send("2", "Record two question");
    assert.deepEqual(inputs.at(-1)!.messages, [
      { role: "user", content: "Record two question" },
    ]);
    await send("1", "Record one follow-up");
    assert.deepEqual(
      inputs.at(-1)!.messages.map((message) => message.content),
      ["Record one question", "Saved record answer", "Record one follow-up"],
    );
    const history = await app.inject({
      method: "GET",
      url: `/assistant/conversations/${conversationId}`,
    });
    assert.equal(history.json().data.messages.length, 6);
    assert.equal(history.json().data.messages[0].contextLabel, `${name} · 1`);
    const scopes = new Set(
      history
        .json()
        .data.messages.map(
          (message: { contextScope: string }) => message.contextScope,
        ),
    );
    assert.equal(scopes.size, 2);
  } finally {
    await app.close();
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db.destroy();
  }
});

test("materialized records support the same assistant read context", async (t) => {
  const { db, call, view, name, admin } = await materializedFixture(t);
  await view();
  await call("POST", "/materialized-views", { name, primaryKey: "id" }, 201);
  const access: Access = {
    principal: { id: admin.id, kind: "user", superuser: true },
    grants: new Map(),
  };
  const tools = (await createContextTools(
    db,
    access,
    recordContext(name),
    async () => access,
  ))!;
  await tools.execute("describe_collection", {});
  const result = await tools.execute("read_item", {
    id: "1",
    fields: ["title"],
  });
  assert.match(JSON.stringify(result), /First/);
  assert.ok(!tools.definitions.some((tool) => /write_items/.test(tool.name)));
});
