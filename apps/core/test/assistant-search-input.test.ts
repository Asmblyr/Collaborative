import assert from "node:assert/strict";
import test from "node:test";
import { parseToolSearch } from "../src/tools/search-input.js";
import { toolErrorResult } from "../src/tools/errors.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";

test("quoted null search is rejected, while explicit clearing and inherited literal queries keep their scope", () => {
  assert.equal(parseToolSearch(null, "Alpha"), "Alpha");
  assert.equal(parseToolSearch("", "Alpha"), "");
  assert.equal(parseToolSearch("Ada", "Alpha"), "Ada");
  assert.equal(parseToolSearch(null, "null"), "null");
  assert.equal(parseToolSearch("NULL"), "NULL");
  try {
    parseToolSearch("null", "Alpha");
    assert.fail("quoted null must not execute a misleading literal lookup");
  } catch (error) {
    const diagnostic = toolErrorResult(error);
    assert.ok("code" in diagnostic && diagnostic.code === "INVALID_ARGUMENTS");
    assert.ok("arguments" in diagnostic);
    assert.deepEqual(diagnostic.arguments, ["q"]);
    assert.ok(
      "hint" in diagnostic &&
        String(diagnostic.hint).includes("no search was executed"),
    );
  }
  for (const value of [undefined, 123, {}, "x".repeat(101)]) {
    assert.throws(() => parseToolSearch(value));
  }
});

test("the whole-turn timeout keeps a bounded default and preserves explicit configuration", () => {
  const env = { OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test" };
  assert.equal(assistantConfigFromEnv(env)?.timeoutMs, 180_000);
  assert.equal(
    assistantConfigFromEnv({ ...env, OPENAI_API_TIMEOUT_MS: "120000" })
      ?.timeoutMs,
    120_000,
  );
  assert.equal(
    assistantConfigFromEnv({ ...env, OPENAI_API_TIMEOUT_MS: "300000" })
      ?.timeoutMs,
    300_000,
  );
  assert.throws(() =>
    assistantConfigFromEnv({ ...env, OPENAI_API_TIMEOUT_MS: "300001" }),
  );
  assert.throws(() =>
    assistantConfigFromEnv({ ...env, OPENAI_API_TIMEOUT_MS: "999" }),
  );
});
