import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { randomUUID } from "node:crypto";
import { loadPlugins } from "../src/plugins/load.js";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import type { PluginPreparedAction } from "@asmblyr/contracts";

test("HTTP and assistant/internal MCP use one calculation; drafts recheck session and owner", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const plugins = (await loadPlugins(new URL("../../../package.json", import.meta.url))).filter(
    (entry) => entry.namespace === "calculator",
  );
  assert.equal(plugins.length, 1);
  const input = { users: 150, monthlyPrice: 990, months: 12, discount: 10 };
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test-model",
  })!;
  const assistant = new AssistantService(config, async (_input, signal, _instructions, run) => {
    assert.ok(run?.tools?.definitions.some((tool) => tool.name === "plugin_calculator__calculate"));
    const presentation = run!.tools!.definitions.find(
      (tool) => tool.name === "present_plugin_result",
    )!;
    assert.deepEqual(presentation.parameters.properties, { resultId: { type: "string" } });
    assert.deepEqual(presentation.parameters.required, ["resultId"]);
    const result = (await run!.tools!.execute("plugin_calculator__calculate", input, signal)) as {
      prepared: PluginPreparedAction;
    };
    assert.ok(result.prepared.draftId);
    const presented = await run!.tools!.execute(
      "present_plugin_result",
      { resultId: result.prepared.draftId },
      signal,
    );
    assert.deepEqual(presented, { presented: true, requiresUserClick: true });
    return { content: "Расчёт готов.", truncated: false };
  });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins,
    assistant,
  });
  const users = [randomUUID(), randomUUID()];
  t.after(async () => {
    await app.close();
    await db("asmblyr_assistant_requests").whereIn("user_id", users).delete();
    await db("asmblyr_users").whereIn("id", users).delete();
    await db.destroy();
  });
  await db("asmblyr_users").insert(
    users.map((id) => ({ id, email: `${id}@example.test`, superuser: true })),
  );
  const tokens = await Promise.all(users.map((id) => issueUserTokens(db, id)));
  const headers = { authorization: `Bearer ${tokens[0].accessToken}` };
  const actionUrl = "/calculator/calculate";
  assert.equal(
    (await app.inject({ method: "POST", url: actionUrl, payload: input })).statusCode,
    401,
  );
  const direct = await app.inject({ method: "POST", url: actionUrl, headers, payload: input });
  assert.equal(direct.statusCode, 200, direct.body);
  assert.equal(direct.json().data.output.totalKopecks, 160_380_000);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: actionUrl,
        headers,
        payload: { ...input, admin: true },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: actionUrl,
        headers: { ...headers, "x-asmblyr-plugin-route": "1" },
        payload: input,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/extensions/calculator/actions/calculate",
        headers,
        payload: input,
      })
    ).statusCode,
    404,
  );
  assert.equal((await app.inject({ method: "GET", url: actionUrl, headers })).statusCode, 404);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: actionUrl,
        headers: { ...headers, "content-type": "application/json" },
        payload: "{broken",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: actionUrl,
        headers,
        payload: { ...input, padding: "x".repeat(16_000) },
      })
    ).statusCode,
    413,
  );
  const answer = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload: {
      messages: [{ role: "user", content: "Рассчитай и открой калькулятор" }],
      context: { page: "extensions/calculator/home", workspaceId: null },
    },
  });
  assert.equal(answer.statusCode, 200, answer.body);
  const card = answer.json().data.pluginResults[0];
  assert.equal("open" in card, false);
  const draftUrl = `/extensions/calculator/drafts/${card.draftId}`;
  const loaded = await app.inject({ method: "GET", url: draftUrl, headers });
  assert.equal(loaded.statusCode, 200, loaded.body);
  assert.deepEqual(loaded.json().data.input, input);
  assert.deepEqual(loaded.json().data.output, direct.json().data.output);
  assert.equal(loaded.headers["cache-control"], "no-store");
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: draftUrl,
        headers: { ...headers, "x-asmblyr-plugin-route": "1" },
      })
    ).statusCode,
    404,
  );
  const foreign = await app.inject({
    method: "GET",
    url: draftUrl,
    headers: { authorization: `Bearer ${tokens[1].accessToken}` },
  });
  assert.equal(foreign.statusCode, 404);
  await db("asmblyr_users").where({ id: users[0] }).update({ status: "disabled" });
  assert.equal((await app.inject({ method: "GET", url: draftUrl, headers })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/mcp", headers })).statusCode, 404);
});
