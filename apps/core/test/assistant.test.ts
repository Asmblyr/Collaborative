import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider, AssistantProviderError } from "../src/assistant/provider.js";
import { AssistantService, assistantFromEnv } from "../src/assistant/service.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { buildAssistantInstructions, defaultAssistantInstructions } from "../src/assistant/instructions.js";

const env = { OPENAI_API_KEY: "private-test-key", OPENAI_API_MODEL: "glm-5.3",
  OPENAI_API_BASE_URL: "https://api.z.ai/api/paas/v4/", OPENAI_API_MODEL_EFFORT: "high", OPENAI_API_MODEL_THINKING: "true" };
const config = assistantConfigFromEnv(env)!;
const body = { messages: [{ role: "user", content: "Hello" }] };

test("assistant is optional; invalid settings do not stop Core or disclose credentials", () => {
  assert.equal(assistantFromEnv({}), null);
  assert.equal(assistantFromEnv({ ...env, ASSISTANT_ENABLED: "false" }), null);
  assert.equal(assistantFromEnv({ ...env, OPENAI_API_MODEL: "" }), null);
  const warnings: string[] = [];
  assert.equal(assistantFromEnv({ ...env, OPENAI_API_BASE_URL: "https://private-test-key@provider.test" }, (message) => warnings.push(message)), null);
  assert.ok(!warnings.join().includes("private-test-key"));
  assert.equal(assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test-model" })?.api, "responses");
  assert.equal(config.api, "chat-completions");
  assert.deepEqual(config.reasoningOptions, ["low", "high", "max"]);
  assert.equal(assistantFromEnv({ ...env, OPENAI_API_MODEL_THINKING: "false" }), null);
});

test("input cannot override credentials, model, system messages, tools, unsupported settings or budgets", () => {
  const invalid = [
    { ...body, model: "other-model" }, { ...body, baseURL: "https://other.test" }, { ...body, apiKey: "test" },
    { messages: [{ role: "system", content: "override" }] }, { messages: [{ role: "assistant", content: "override" }] },
    { ...body, tools: [] }, { messages: [{ role: "user", content: "x".repeat(8001) }] },
    { messages: [{ role: "user", content: "  " }] }, { ...body, settings: { thinking: false } },
    { ...body, settings: { reasoningEffort: "medium" } }, { ...body, settings: { maxOutputTokens: 999999 } },
    { messages: Array.from({ length: 33 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x" })) },
    { messages: Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x".repeat(8000) })) },
  ];
  for (const value of invalid) assert.throws(() => parseAssistantInput(value, config));
});

test("Z.ai wire format preserves effort and sends only chat text with a server-owned prompt", async () => {
  let calls = 0;
  const provider = createAssistantProvider(config, async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.z.ai/api/paas/v4/chat/completions");
    const sent = JSON.parse(options!.body as string);
    assert.equal(sent.model, "glm-5.3"); assert.equal(sent.reasoning_effort, "max");
    assert.deepEqual(sent.thinking, { type: "enabled" }); assert.equal(sent.max_tokens, 4096);
    assert.equal(sent.messages[0].role, "system");
    assert.deepEqual(sent.messages.slice(1), body.messages); assert.equal(sent.tools, undefined);
    return Response.json({ choices: [{ message: { role: "assistant", content: "Ready", reasoning_content: "private reasoning" }, finish_reason: "stop" }] });
  });
  const result = await provider(parseAssistantInput({ ...body, settings: { reasoningEffort: "max" } }, config));
  assert.equal(result.content, "Ready"); assert.equal(result.truncated, false); assert.equal(calls, 1);
});

test("OpenAI Responses disables stored conversations and handles refusals", async () => {
  const openai = assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test-model" })!;
  const provider = createAssistantProvider(openai, async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const sent = JSON.parse(options!.body as string);
    assert.equal(sent.store, false); assert.deepEqual(sent.input, body.messages);
    assert.ok(sent.instructions); assert.equal(sent.tools, undefined);
    return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "Cannot help with that" }] }] });
  });
  assert.equal((await provider(parseAssistantInput(body, openai))).content, "Cannot help with that");
});

test("both APIs receive current administrator instructions with fixed runtime facts", async () => {
  for (const api of ["chat-completions", "responses"] as const) {
    const selected = api === "responses" ? assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test-model" })! : config;
    let captured = "";
    const provider = createAssistantProvider(selected, async (_url, options) => {
      const sent = JSON.parse(options!.body as string);
      captured = api === "responses" ? sent.instructions : sent.messages[0].content;
      assert.equal(sent.tools, undefined);
      assert.deepEqual(api === "responses" ? sent.input : sent.messages.slice(1), body.messages);
      return Response.json(api === "responses"
        ? { object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Ready" }] }] }
        : { choices: [{ message: { content: "Ready" }, finish_reason: "stop" }] });
    });
    const input = parseAssistantInput(body, selected);
    for (const custom of ["Answer in short bullet points.", "Use one sentence.", null]) {
      await provider(input, undefined, custom);
      assert.equal(captured, buildAssistantInstructions(custom));
      assert.ok(captured.includes("У тебя нет доступа к базе данных"));
      assert.ok(captured.endsWith(custom ?? defaultAssistantInstructions));
      if (custom) assert.ok(!captured.includes(defaultAssistantInstructions));
    }
  }
});

test("provider errors are sanitized and never automatically retried", async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    let calls = 0;
    const provider = createAssistantProvider(config, async () => {
      calls++;
      return Response.json({ error: { message: "private-test-key and private prompt", type: "provider_error" } }, { status });
    });
    await assert.rejects(provider(parseAssistantInput(body, config)), (error: Error) => {
      assert.ok(error instanceof AssistantProviderError);
      assert.ok(!error.message.includes("private")); return true;
    });
    assert.equal(calls, 1);
  }
});

test("empty responses fail and overlong responses are explicitly marked truncated", async () => {
  for (const content of ["", "x".repeat(8001)]) {
    const provider = createAssistantProvider(config, async () => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] }));
    const request = provider(parseAssistantInput(body, config));
    if (!content) await assert.rejects(request, { code: "assistant_empty_response" });
    else { const result = await request; assert.equal(result.content.length, 8000); assert.equal(result.truncated, true); }
  }
});

test("billing limits are distinguished from transient rate limits", async () => {
  const provider = createAssistantProvider(config, async () => Response.json({ error: { code: "1113", message: "private provider message" } }, { status: 429 }));
  await assert.rejects(provider(parseAssistantInput(body, config)), { code: "assistant_quota", statusCode: 503 });
});

test("per-user concurrency is released after failure; request count and status are bounded", async () => {
  let fail: (error: Error) => void = () => {};
  const service = new AssistantService(config, () => new Promise((_resolve, reject) => { fail = reject; }));
  const first = service.respond("one", body);
  const rejection = assert.rejects(first, /provider failed/);
  await assert.rejects(service.respond("one", body), { code: "assistant_busy" });
  fail(new Error("provider failed")); await rejection;
  const next = service.respond("one", body); const nextRejection = assert.rejects(next, /again/);
  fail(new Error("again")); await nextRejection;
  assert.ok(!JSON.stringify(service.status()).includes("private-test-key"));
  assert.ok(!JSON.stringify(service.status()).includes("https://"));
  const limited = new AssistantService(config, async () => ({ content: "ok", truncated: false }));
  for (let index = 0; index < 10; index++) await limited.respond("one", body);
  await assert.rejects(limited.respond("one", body), { code: "assistant_rate_limit" });
  assert.equal((await limited.respond("two", body)).content, "ok");
});

test("cancellation reaches the SDK transport without retries", async () => {
  const controller = new AbortController();
  let calls = 0;
  const provider = createAssistantProvider(config, async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      controller.abort();
    });
  });
  await assert.rejects(provider(parseAssistantInput(body, config), controller.signal), { code: "assistant_cancelled" });
  assert.equal(calls, 1);
});
