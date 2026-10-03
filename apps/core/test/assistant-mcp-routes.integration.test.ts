import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

test("assistant discovers and reads through MCP from another page, journals calls and honors context off", async (t) => {
  const config = {
    ...assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test" })!,
    api: "chat-completions" as const,
  };
  let collection = "";
  let step = 0;
  let plainChat = false;
  const provider = createAssistantProvider(config, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const results = body.messages
      .filter((message) => message.role === "tool")
      .map((message) => JSON.parse(message.content));
    let call: { name: string; arguments: string } | undefined;
    if (plainChat) {
      assert.equal(body.tools, undefined);
      assert.equal(results.length, 0);
    } else {
      assert.equal(body.tools.length, 8);
      if (step === 0) {
        call = {
          name: "list_collections",
          arguments: JSON.stringify({ q: collection, page: 1, limit: 5 }),
        };
      } else if (step === 1) {
        assert.equal(results[0].collections[0].name, collection);
        call = { name: "describe_collection", arguments: JSON.stringify({ collection }) };
      } else if (step === 2) {
        assert.equal(results[1].collection, collection);
        call = {
          name: "search_items",
          arguments: JSON.stringify({
            collection,
            q: null,
            filter: null,
            fields: ["title"],
            page: 1,
            limit: 5,
            sort: null,
            direction: null,
          }),
        };
      } else {
        assert.deepEqual(
          results[2].items.map((item) => item.values.title),
          ["Alpha", "Beta"],
        );
        assert.ok(!JSON.stringify(body).includes("hidden-post-value"));
      }
    }
    step++;
    return Response.json({
      model: "test",
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      choices: [
        {
          finish_reason: call ? "tool_calls" : "stop",
          message: {
            role: "assistant",
            content: call ? null : "Verified through MCP",
            ...(call
              ? { tool_calls: [{ id: `call-${step}`, type: "function", function: call }] }
              : {}),
          },
        },
      ],
    });
  });
  const { db, app, headers, names, access } = await mcpFixture(
    t,
    new AssistantService(config, provider),
  );
  collection = names.posts;
  const payload = {
    messages: [{ role: "user", content: "Find permitted records" }],
    context: { page: "settings", workspaceId: null },
  };
  const response = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data.content, "Verified through MCP");
  assert.deepEqual(response.json().data.proposals, []);
  assert.equal(step, 4);
  const journal = await db("asmblyr_assistant_requests")
    .where({ user_id: access.principal.id })
    .orderBy("call_index");
  assert.deepEqual(
    journal.map((row) => row.call_index),
    [1, 2, 3, 4],
  );
  assert.ok(journal.every((row) => row.status === "succeeded"));
  assert.ok(!/Alpha|Beta|hidden-post-value|Find permitted records/.test(JSON.stringify(journal)));

  plainChat = true;
  const plain = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload: { ...payload, context: null },
  });
  assert.equal(plain.statusCode, 200, plain.body);
  assert.equal(step, 5);
});
