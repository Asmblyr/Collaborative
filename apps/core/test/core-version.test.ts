import assert from "node:assert/strict";
import test from "node:test";
import { CORE_VERSION, resolveCoreVersion } from "../src/version.js";

test("Core compatibility uses its own package or an explicit release version", () => {
  assert.equal(resolveCoreVersion("0.1.0-beta.8"), "0.1.0-beta.8");
  assert.equal(
    resolveCoreVersion("0.1.0-beta.8", "0.1.0-beta.9"),
    "0.1.0-beta.9",
  );
  assert.equal(
    resolveCoreVersion("0.1.0-beta.8", "0.1.0-beta.8+sha.abc123"),
    "0.1.0-beta.8+sha.abc123",
  );
  assert.equal(resolveCoreVersion("0.1.0-beta.8", ""), "0.1.0-beta.8");
  assert.notEqual(CORE_VERSION, "0.0.0");
  assert.throws(() => resolveCoreVersion("0.0.0"), /semantic version/);
  assert.throws(
    () => resolveCoreVersion("0.1.0-beta.8", "v0.1.0-beta.9"),
    /semantic version/,
  );
  assert.throws(
    () => resolveCoreVersion("0.1.0-beta.8", "main"),
    /semantic version/,
  );
  assert.throws(
    () => resolveCoreVersion("0.1.0-beta.8", "abcdef123456"),
    /semantic version/,
  );
});
