import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { compactionInstructions } from "../src/assistant/history-context.js";

test("compaction and the final answer share one timeout and release the user slot", async () => {
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  config.timeoutMs = 60;
  const signals: AbortSignal[] = [];
  let slow = true;
  const assistant = new AssistantService(
    config,
    async (_input, signal, instructions) => {
      signals.push(signal!);
      if (slow) {
        await delay(
          instructions === compactionInstructions ? 20 : 1000,
          undefined,
          { signal },
        );
      }
      return { content: "A concise answer", truncated: false };
    },
  );
  const body = { messages: [{ role: "user", content: "Continue" }] };
  await assert.rejects(
    assistant.respond(
      "user",
      body,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async (input, summarize) => ({
        ...input,
        memory: await summarize("Earlier messages"),
      }),
    ),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, "assistant_timeout");
      assert.equal(
        (error as { summary: { modelCalls: number } }).summary.modelCalls,
        2,
      );
      return true;
    },
  );
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[1].aborted, true);
  slow = false;
  assert.equal(
    (await assistant.respond("user", body)).content,
    "A concise answer",
  );
});
