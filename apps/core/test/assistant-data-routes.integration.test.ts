import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantProvider } from "../src/assistant/provider.js";

test("HTTP data tools reauthenticate during a turn; provider sees permitted data, telemetry never stores it", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const name = `test_ai_http_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const config = {
    ...assistantConfigFromEnv({
      OPENAI_API_KEY: "test",
      OPENAI_API_MODEL: "test",
    })!,
    api: "chat-completions" as const,
  };
  let step = 0,
    mode = "read",
    permissionId = "",
    readerId = "";
  const generate = createAssistantProvider(config, async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    let calls: { name: string; arguments: string }[] = [];
    if (step === 0) calls = [{ name: "describe_collection", arguments: "{}" }];
    if (step === 1) {
      if (mode === "revoke-fields")
        await db("asmblyr_permissions")
          .where({ id: permissionId })
          .update({ fields: ["id"] });
      if (mode === "disable")
        await db("asmblyr_users")
          .where({ id: readerId })
          .update({ status: "disabled" });
      calls = [
        {
          name: "search_items",
          arguments: JSON.stringify({
            q: "",
            filter: "",
            fields: ["title"],
            limit: 2,
            page: 1,
            sort: null,
            direction: null,
          }),
        },
        {
          name: "read_item",
          arguments: JSON.stringify({ id: "1", fields: ["title"] }),
        },
        {
          name: "count_items",
          arguments: JSON.stringify({ q: "", filter: "" }),
        },
      ];
    }
    if (step === 2) {
      const results = sent.messages
        .filter((m: { role: string }) => m.role === "tool")
        .slice(-3)
        .map((m: { content: string }) => JSON.parse(m.content));
      if (mode === "read") {
        assert.equal(results[0].items[0].values.title, "visible-fixture");
        assert.equal(results[1].item.values.title, "visible-fixture");
        assert.equal(results[2].count, "1");
      } else {
        assert.ok("error" in results[0]);
        assert.ok("error" in results[1]);
        if (mode === "disable") assert.ok("error" in results[2]);
        else assert.equal(results[2].count, "1");
      }
      assert.ok(!JSON.stringify(sent).includes("never-expose-value"));
    }
    step++;
    return Response.json({
      model: "test",
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      choices: [
        {
          finish_reason: calls.length ? "tool_calls" : "stop",
          message: {
            role: "assistant",
            content: calls.length ? null : "Verified answer",
            ...(calls.length
              ? {
                  tool_calls: calls.map((fn, i) => ({
                    id: `${step}-${i}`,
                    type: "function",
                    function: fn,
                  })),
                }
              : {}),
          },
        },
      ],
    });
  });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    assistant: new AssistantService(config, generate),
  });
  const ids: string[] = [];
  let policyId = "";
  try {
    const users = await db("asmblyr_users")
      .insert([
        { email: `${randomUUID()}@example.test`, superuser: true },
        { email: `${randomUUID()}@example.test`, superuser: false },
      ])
      .returning<{ id: string }[]>("id");
    ids.push(...users.map((user) => user.id));
    readerId = ids[1];
    const admin = {
      authorization: `Bearer ${(await issueUserTokens(db, ids[0])).accessToken}`,
    };
    const reader = {
      authorization: `Bearer ${(await issueUserTokens(db, readerId)).accessToken}`,
    };
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      headers: admin,
      payload: {
        name,
        primaryKey: { name: "id", type: "serial" },
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);
    await db(name).insert({
      title: "visible-fixture",
      secret: "never-expose-value",
    });
    const policy = await app.inject({
      method: "POST",
      url: "/policies",
      headers: admin,
      payload: { name },
    });
    assert.equal(policy.statusCode, 201);
    policyId = policy.json().data.id;
    const permission = await app.inject({
      method: "POST",
      url: "/permissions",
      headers: admin,
      payload: { collection: name, action: "read", fields: ["title"] },
    });
    assert.equal(permission.statusCode, 201);
    permissionId = permission.json().data.id;
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/permissions/${permissionId}`,
          headers: admin,
        })
      ).statusCode,
      204,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${policyId}/users/${readerId}`,
          headers: admin,
        })
      ).statusCode,
      204,
    );
    for (mode of ["read", "revoke-fields", "disable"]) {
      step = 0;
      await db("asmblyr_permissions")
        .where({ id: permissionId })
        .update({ fields: ["title"] });
      const response = await app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers: reader,
        payload: {
          messages: [{ role: "user", content: "private-request-marker" }],
          context: {
            page: "items",
            workspaceId: null,
            collection: name,
            table: {
              page: 1,
              size: 25,
              q: "",
              filter: "",
              sort: "id",
              direction: "asc",
              selectedCount: 0,
              editorOpen: false,
            },
          },
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(step, 3);
      assert.equal(response.json().data.content, "Verified answer");
    }
    const journal = await db("asmblyr_assistant_requests").where({
      user_id: readerId,
    });
    assert.equal(journal.length, 9);
    assert.equal(new Set(journal.map((row) => row.turn_id)).size, 3);
    assert.ok(journal.every((row) => row.status === "succeeded"));
    assert.ok(
      !/visible-fixture|never-expose-value|private-request-marker|Verified answer/.test(
        JSON.stringify(journal),
      ),
    );
  } finally {
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    if (policyId) await db("asmblyr_policies").where({ id: policyId }).delete();
    await db("asmblyr_assistant_requests").whereIn("user_id", ids).delete();
    await db("asmblyr_users").whereIn("id", ids).delete();
    await app.close();
    await db.destroy();
  }
});
