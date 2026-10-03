import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { createContextTools as contextTools, validateFilterProposal } from "../src/assistant/context-tools.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { createAssistantJournal } from "../src/assistant/telemetry/journal.js";
import type { Access } from "../src/permissions/access.js";
import type { AssistantContext } from "../src/assistant/context-input.js";

function createContextTools(db: ReturnType<typeof knex>, access: Access, context: AssistantContext | null) {
  return contextTools(db, access, context, async () => access);
}

test("context tools enforce field and relation grants; proposals revalidate; every model call belongs to a turn", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const posts = `test_ai_posts_${suffix}`, authors = `test_ai_authors_${suffix}`, junction = `test_ai_links_${suffix}`;
  const userId = randomUUID();
  const access: Access = { principal: { id: userId, kind: "user", superuser: false }, grants: new Map([
    [`${posts}:read`, ["title", "author_id", "authors"]], [`${authors}:read`, ["title", "posts"]],
  ]) };
  const context: AssistantContext = { page: "items", workspaceId: null, collection: posts,
    table: { page: 1, size: 25, sort: "id", direction: "asc", q: "", filter: "", selectedCount: 2, editorOpen: false } };
  const filter = (field: string, op = "contains", value: unknown = "Ada") => ({ logic: "and", children: [{ field, op, value }] });
  try {
    for (const name of [authors, posts]) {
      const response = await app.inject({ method: "POST", url: "/collections", payload: { name, primaryKey: { name: "id", type: "serial" },
        fields: [{ name: "title", type: "text" }, { name: "secret", type: "text", defaultValue: "never-send-default" }] } });
      assert.equal(response.statusCode, 201, response.body);
    }
    for (const payload of [{ name: "author_id", targetCollection: authors, reverseField: "posts" },
      { kind: "m2m", name: "authors", targetCollection: authors, junctionCollection: junction, sourceKey: "post_id", targetKey: "author_id" }]) {
      const response = await app.inject({ method: "POST", url: `/collections/${posts}/relations`, payload });
      assert.equal(response.statusCode, 201, response.body);
    }
    assert.equal(await createContextTools(db, access, null), undefined);
    const tools = (await createContextTools(db, access, context))!;
    assert.ok("error" in await tools.execute("propose_filter", { filter: JSON.stringify(filter("title")) }));
    const schema = await tools.execute("describe_collection", {});
    assert.ok(!JSON.stringify(schema).includes("secret")); assert.ok(!JSON.stringify(schema).includes("never-send-default"));
    assert.ok(JSON.stringify(schema).includes("author_id.title")); assert.ok(JSON.stringify(schema).includes("authors.title"));
    for (const invalid of [filter("secret"), filter("author_id.secret"), filter("title", "gt"), filter("title", "eq", 5),
      filter("author_id.posts.title"), filter("title", "isNull", "unexpected")]) {
      assert.ok("error" in await tools.execute("propose_filter", { filter: JSON.stringify(invalid) }));
      assert.equal(tools.proposals.length, 0);
    }
    assert.ok("error" in await tools.execute("write_items", { rows: [] }));
    await tools.execute("propose_filter", { filter: JSON.stringify(filter("author_id.title")) });
    assert.equal(tools.proposals.length, 1);
    const proposal = tools.proposals[0];
    assert.deepEqual(proposal.filter, filter("author_id.title"));
    assert.deepEqual((await validateFilterProposal(db, access, { context, collectionId: proposal.collectionId, filter: proposal.filter })).filter, proposal.filter);
    await assert.rejects(validateFilterProposal(db, access, { context, collectionId: randomUUID(), filter: proposal.filter }), { statusCode: 409 });
    access.grants.delete(`${authors}:read`);
    await assert.rejects(validateFilterProposal(db, access, { context, collectionId: proposal.collectionId, filter: proposal.filter }), { statusCode: 403 });
    const limited = await createContextTools(db, access, context);
    assert.ok(!JSON.stringify(await limited!.execute("describe_collection", {})).includes("author_id.title"));
    access.grants.set(`${authors}:read`, ["title", "posts"]);
    const reverse = await createContextTools(db, access, { ...context, collection: authors });
    assert.ok(JSON.stringify(await reverse!.execute("describe_collection", {})).includes("posts.title"));
    access.grants.set(`${posts}:read`, ["title"]);
    const noReverseFk = await createContextTools(db, access, { ...context, collection: authors });
    assert.ok(!JSON.stringify(await noReverseFk!.execute("describe_collection", {})).includes("posts.title"));
    await assert.rejects(createContextTools(db, { ...access, grants: new Map() }, context), { statusCode: 403 });
    await assert.rejects(createContextTools(db, access, { ...context, table: { ...context.table!, sort: "secret" } }), { statusCode: 403 });

    let calls = 0;
    const config = { ...assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test-model" })!, api: "chat-completions" as const };
    const generate = createAssistantProvider(config, async () => {
      const i = calls++;
      return Response.json({ model: "test", usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, choices: [{ finish_reason: i < 2 ? "tool_calls" : "stop",
        message: { role: "assistant", content: i < 2 ? null : "Ready", ...(i < 2 ? { tool_calls: [{ id: String(i), type: "function", function: {
          name: i === 0 ? "describe_collection" : "propose_filter", arguments: i === 0 ? "{}" : JSON.stringify({ filter: JSON.stringify(filter("title")) }),
        } }] } : {}) } }] });
    });
    const service = new AssistantService(config, generate);
    const result = await service.respond(userId, { messages: [{ role: "user", content: "private prompt" }], context }, undefined, undefined,
      createAssistantJournal(db, () => assert.fail("Journal should finish")), (c) => createContextTools(db, access, c));
    assert.equal(result.proposals?.length, 1);
    const rows = await db("asmblyr_assistant_requests").where({ user_id: userId }).orderBy("call_index");
    assert.equal(rows.length, 3); assert.equal(new Set(rows.map((r) => r.turn_id)).size, 1);
    assert.deepEqual(rows.map((r) => r.call_index), [1, 2, 3]);
    assert.equal(rows.reduce((total, r) => total + r.total_tokens, 0), 36);
    assert.ok(rows.every((r) => r.status === "succeeded"));
    assert.ok(!JSON.stringify(rows).includes("private prompt"));
    const migration = createRequire(import.meta.url)("../migrations/20260930090000_assistant_turns.cjs");
    await assert.rejects(migration.down(db), /Cannot discard assistant turn grouping/);
  } finally {
    for (const name of [junction, posts, authors]) {
      await db.schema.dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
    }
    await db("asmblyr_assistant_requests").where({ user_id: userId }).delete();
    await app.close(); await db.destroy();
  }
});
