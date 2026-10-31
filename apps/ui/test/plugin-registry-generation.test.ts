import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generateUiRegistry } from "@asmblyr-collaborative/kit/node";
import { createUiPluginLoader } from "../src/components/plugins/registry-loader";

for (const source of [false, true]) {
  test(`generated ${source ? "source" : "built"} registry does not execute disabled UI entrypoints`, async (t) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "asmblyr-ui-registry-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const packageRoot = path.join(directory, "packages", "fixture-ui");
    await mkdir(path.join(packageRoot, "ui"), { recursive: true });
    await mkdir(path.join(directory, "node_modules"));
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ type: "module", asmblyr: { plugins: ["fixture-ui"] } }),
    );
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "fixture-ui",
        type: "module",
        version: "1.0.0",
        exports: {
          "./package.json": "./package.json",
          "./ui": "./ui/index.mjs",
        },
        asmblyr: { manifest: { version: 1, namespace: "fixture" } },
      }),
    );
    await writeFile(
      path.join(packageRoot, "ui/index.mjs"),
      'throw new Error("disabled UI entry executed"); export default {};',
    );
    await writeFile(
      path.join(packageRoot, "ui/index.ts"),
      'throw new Error("disabled UI entry executed"); export default {};',
    );
    await symlink(
      packageRoot,
      path.join(directory, "node_modules/fixture-ui"),
      "junction",
    );
    const output = path.join(directory, "registry.ts");
    await generateUiRegistry(
      pathToFileURL(path.join(directory, "package.json")),
      output,
      source,
    );
    const generated = await import(pathToFileURL(output).href);
    const loader = createUiPluginLoader(generated.uiPluginModules);
    assert.deepEqual(await loader.load([]), { plugins: [], failed: [] });
    assert.deepEqual((await loader.load(["fixture-ui"])).failed, [
      { packageName: "fixture-ui", namespace: "fixture" },
    ]);
  });
}
