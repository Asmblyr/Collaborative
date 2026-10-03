import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPlugins } from "../src/plugins/load.js";
import {
  pluginPackageFixture as fixture,
  addPluginPackage as addPackage,
} from "./support/plugin-package-fixture.js";

test("unapproved capability stops loading before any plugin code executes", async (t) => {
  const { directory, project } = await fixture(t, [
    "approved",
    "needs-approval",
  ]);
  await addPackage(
    directory,
    "approved",
    1,
    "throw new Error('must not execute')",
  );
  const root = await addPackage(
    directory,
    "needs-approval",
    1,
    "throw new Error('must not execute')",
  );
  const manifestPath = path.join(root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.asmblyr.manifest.capabilities = ["identity.profile"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    loadPlugins(project),
    (error: Error & { cause?: Error }) => {
      assert.match(
        error.cause?.message ?? "",
        /requires approval.*identity.profile/,
      );
      return true;
    },
  );
});

test("hook indexes reject traversal and duplicate paths before import", async (t) => {
  const { directory, project } = await fixture(t, ["hooks"]);
  const root = await addPackage(
    directory,
    "hooks",
    1,
    "throw new Error('must not execute')",
    "hooks",
  );
  const manifestPath = path.join(root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.exports["./hooks"] = "./hooks.json";
  manifest.asmblyr.manifest.capabilities = ["hooks.items"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(
    project,
    JSON.stringify({
      asmblyr: {
        plugins: ["hooks"],
        pluginPermissions: { hooks: ["hooks.items"] },
      },
    }),
  );
  await mkdir(path.join(root, "server/hooks"), { recursive: true });
  await writeFile(
    path.join(root, "server/hooks/created.js"),
    "throw new Error('must not execute')",
  );
  for (const files of [
    ["./server/hooks/../../../outside.js"],
    ["./server/hooks/created.js", "./server/hooks/created.js"],
  ]) {
    await writeFile(path.join(root, "hooks.json"), JSON.stringify(files));
    await assert.rejects(
      loadPlugins(project),
      (error: Error & { cause?: Error }) => {
        assert.match(error.cause?.message ?? "", /compiled hook path/);
        return true;
      },
    );
  }
});
