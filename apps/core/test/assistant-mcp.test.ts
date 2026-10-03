import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import type { AssistantTools } from "../src/assistant/tool-contract.js";

test("assistant closes the per-turn MCP connection on success, provider failure and cancellation", async () => {
  const config = assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test" })!;
  let closed = 0;
  let fail = false;
  const service = new AssistantService(config, async (_input, signal) => {
    signal?.throwIfAborted();
    if (fail) throw new Error("Provider fixture failed");
    return { content: "Ready", truncated: false };
  });
  const tools: AssistantTools = {
    context: {},
    definitions: [],
    proposals: [],
    execute: async () => ({}),
    close: async () => {
      closed++;
    },
  };
  const body = { messages: [{ role: "user", content: "Hi" }] };
  await service.respond("user", body, undefined, undefined, undefined, async () => tools);
  assert.equal(closed, 1);
  fail = true;
  await assert.rejects(
    service.respond("user", body, undefined, undefined, undefined, async () => tools),
    /Provider fixture failed/,
  );
  assert.equal(closed, 2);
  const controller = new AbortController();
  await assert.rejects(
    service.respond("user", body, controller.signal, undefined, undefined, async () => {
      controller.abort();
      return tools;
    }),
  );
  assert.equal(closed, 3);
  fail = false;
  await service.respond("user", body, undefined, undefined, undefined, async () => tools);
  assert.equal(closed, 4);
});
