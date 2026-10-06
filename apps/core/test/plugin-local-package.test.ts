import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { isLocalPluginPackage } from "@asmblyr-collaborative/kit/node";

test("source selection excludes installed dependencies, private caches and external packages", () => {
  const root = path.resolve("workspace");
  for (const relative of [
    "packages/plugin-comments",
    "examples/plugins/color",
    "plugins/local",
  ]) {
    assert.equal(isLocalPluginPackage(root, path.join(root, relative)), true);
  }
  for (const relative of [
    "",
    "node_modules/plugin",
    "nested/node_modules/plugin",
    ".pnpm-store/plugin",
    ".local-data/plugin",
    "../external/plugin",
  ]) {
    assert.equal(
      isLocalPluginPackage(root, path.resolve(root, relative)),
      false,
    );
  }
});
