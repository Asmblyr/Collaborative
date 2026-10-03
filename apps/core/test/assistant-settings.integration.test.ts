import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { applyAssistantDefaults, initialAssistantDefaults } from "../src/assistant/settings.js";
import type { AssistantInput } from "../src/assistant/validation.js";
import { defaultAssistantInstructions } from "../src/assistant/instructions.js";

test("system settings enforce administrator access, persistence, runtime defaults and server disable", async () => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const config = assistantConfigFromEnv({ OPENAI_API_KEY: "settings-private-key", OPENAI_API_MODEL: "glm-5.3",
    OPENAI_API_BASE_URL: "https://api.z.ai/api/coding/paas/v4/" })!;
  const generated: AssistantInput[] = [];
  const prompts: (string | null | undefined)[] = [];
  const assistant = new AssistantService(config, async (input, _signal, instructions) => {
    generated.push(input); prompts.push(instructions); return { content: "Test", truncated: false };
  });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false, assistant });
  const disabled = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const original = await db("asmblyr_settings").where({ key: "assistant" }).first();
  const ids: string[] = [];
  let serviceId: string | undefined;
  try {
    const users = await db("asmblyr_users").insert([
      { email: `settings-admin-${randomUUID()}@example.test`, superuser: true },
      { email: `settings-member-${randomUUID()}@example.test`, superuser: false },
    ]).returning<{ id: string }[]>("id");
    ids.push(...users.map((user) => user.id));
    const admin = { authorization: `Bearer ${(await issueUserTokens(db, ids[0])).accessToken}` };
    const member = { authorization: `Bearer ${(await issueUserTokens(db, ids[1])).accessToken}` };
    const path = "/settings/assistant";
    const customInstructions = `Answer concisely.\n${"Дай короткий ответ. ".repeat(250).trim()}`;
    const payload = { enabled: true, reasoningEffort: "low", thinking: null, instructions: customInstructions };
    for (const method of ["GET", "PUT"] as const) {
      assert.equal((await app.inject({ method, url: path, ...(method === "PUT" ? { payload } : {}) })).statusCode, 401);
      assert.equal((await app.inject({ method, url: path, headers: member, ...(method === "PUT" ? { payload } : {}) })).statusCode, 403);
    }
    const service = await app.inject({ method: "POST", url: "/service-accounts", headers: admin, payload: { name: "Settings test" } });
    assert.equal(service.statusCode, 201); serviceId = service.json().data.id;
    const key = await app.inject({ method: "POST", url: `/service-accounts/${serviceId}/keys`, headers: admin, payload: { name: "test" } });
    const grant = await app.inject({ method: "POST", url: "/auth/service-token", payload: { key: key.json().data.secret } });
    const machine = { authorization: `Bearer ${grant.json().accessToken}` };
    assert.equal((await app.inject({ method: "GET", url: path, headers: machine })).statusCode, 403);
    assert.equal((await app.inject({ method: "PUT", url: path, headers: machine, payload })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: `${path}/telemetry`, headers: machine })).statusCode, 403);

    for (const invalid of [{ ...payload, apiKey: "no" }, { ...payload, model: "other" }, { ...payload, baseURL: "https://other.test" },
      { ...payload, reasoningEffort: "medium" }, { ...payload, thinking: false }, { ...payload, enabled: "true" },
      { ...payload, instructions: "x".repeat(8001) }, { ...payload, instructions: " \n " },
      { ...payload, instructions: "NUL\0" }, { ...payload, instructions: {} }]) {
      assert.equal((await app.inject({ method: "PUT", url: path, headers: admin, payload: invalid })).statusCode, 400);
    }
    const legacyValue = { enabled: true, reasoningEffort: null, thinking: null };
    await db("asmblyr_settings").insert({ key: "assistant", value: JSON.stringify(legacyValue) }).onConflict("key").merge();
    assert.equal((await app.inject({ method: "GET", url: path, headers: admin })).json().data.value.instructions, null);
    const saved = await app.inject({ method: "PUT", url: path, headers: admin, payload });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.headers["cache-control"], "no-store");
    assert.ok(!saved.body.includes("settings-private-key")); assert.ok(!saved.body.includes("api.z.ai"));
    assert.equal(saved.json().data.instructionDefaults.text, defaultAssistantInstructions);
    assert.deepEqual((await app.inject({ method: "GET", url: path, headers: admin })).json().data.value, payload);
    assert.deepEqual((await db("asmblyr_settings").where({ key: "assistant" }).first()).value, payload);
    const event = await db("asmblyr_security_events").where({ actor_id: ids[0], action: "settings.assistant.update" }).first();
    assert.deepEqual(event.details.settings, { ...payload, instructions: { source: "custom", length: customInstructions.length,
      sha256: createHash("sha256").update(customInstructions).digest("hex") } });
    assert.ok(!JSON.stringify(event).includes(customInstructions));
    const oldClientSave = await app.inject({ method: "PUT", url: path, headers: admin, payload: { ...legacyValue, reasoningEffort: "low" } });
    assert.equal(oldClientSave.statusCode, 200); assert.equal(oldClientSave.json().data.value.instructions, customInstructions);
    assert.equal((await app.inject({ method: "GET", url: "/assistant/status", headers: admin })).json().data.settings.defaultEffort, "low");
    assert.ok(!(await app.inject({ method: "GET", url: "/assistant/status", headers: admin })).body.includes("instructions"));
    const message = { messages: [{ role: "user", content: "Test" }] };
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: message })).statusCode, 200);
    assert.equal(generated.at(-1)?.reasoningEffort, "low");
    assert.equal(prompts.at(-1), customInstructions);
    for (const bypass of [{ ...message, instructions: "override" }, { ...message, settings: { instructions: "override" } }]) {
      assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: bypass })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: { ...message, settings: { reasoningEffort: "max" } } })).statusCode, 200);
    assert.equal(generated.at(-1)?.reasoningEffort, "max");

    assert.equal((await app.inject({ method: "PUT", url: path, headers: admin, payload: { ...payload, enabled: false } })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/assistant/status", headers: admin })).json().data.available, false);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: message })).statusCode, 503);
    assert.equal(generated.length, 2);
    assert.equal((await app.inject({ method: "PUT", url: path, headers: admin, payload: initialAssistantDefaults })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: path, headers: admin })).json().data.value.instructions, null);
    assert.equal((await app.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: message })).statusCode, 200);
    assert.equal(prompts.at(-1), null);
    assert.equal((await app.inject({ method: "GET", url: "/assistant/status", headers: admin })).json().data.settings.defaultEffort, "high");
    assert.equal((await disabled.inject({ method: "GET", url: path, headers: admin })).json().data.configured, false);
    assert.equal((await disabled.inject({ method: "PUT", url: path, headers: admin, payload: initialAssistantDefaults })).statusCode, 200);
    assert.equal((await disabled.inject({ method: "GET", url: "/assistant/status", headers: admin })).json().data.available, false);
    assert.equal((await disabled.inject({ method: "POST", url: "/assistant/messages", headers: admin, payload: message })).statusCode, 503);
    assert.equal(applyAssistantDefaults(config, { ...initialAssistantDefaults, reasoningEffort: "medium", thinking: false }).defaultEffort, "high");
    assert.equal(applyAssistantDefaults(config, { ...initialAssistantDefaults, thinking: false }).defaultThinking, true);
  } finally {
    await app.close(); await disabled.close();
    if (original) await db("asmblyr_settings").insert(original).onConflict("key").merge();
    else await db("asmblyr_settings").where({ key: "assistant" }).delete();
    if (serviceId) await db("asmblyr_service_accounts").where({ id: serviceId }).delete();
    if (ids.length) {
      await db("asmblyr_assistant_requests").whereIn("user_id", ids).delete();
      await db("asmblyr_security_events").whereIn("actor_id", ids).delete();
      await db("asmblyr_users").whereIn("id", ids).delete();
    }
    await db.destroy();
  }
});
