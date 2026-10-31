import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generateUiRegistry } from "@asmblyr-collaborative/kit/node";
import { createUiPluginLoader } from "../src/components/plugins/registry-loader";

for (const source of [false, true]) {
  test(`generated ${source ? "source" : "built"} registry does not execute disabled UI entrypoints`, async (t) => {
    const marker = `registry-${randomUUID()}`;
    const executions = globalThis as unknown as Record<
      string,
      number | undefined
    >;
    t.after(() => {
      delete executions[marker];
    });
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
      `globalThis[${JSON.stringify(marker)}] = 1; export default { translations: { en: { entry: "built" } } };`,
    );
    await writeFile(
      path.join(packageRoot, "ui/index.ts"),
      `globalThis[${JSON.stringify(marker)}] = 1; export default { translations: { en: { entry: "source" } } };`,
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
    assert.equal(executions[marker], undefined);
    const loader = createUiPluginLoader(generated.uiPluginModules);
    assert.deepEqual(await loader.load([]), { plugins: [], failed: [] });
    assert.equal(executions[marker], undefined);
    const enabled = await loader.load(["fixture-ui"]);
    assert.deepEqual(enabled.failed, []);
    assert.equal(enabled.plugins.length, 1);
    assert.equal(enabled.plugins[0].packageName, "fixture-ui");
    assert.equal(
      enabled.plugins[0].definition.translations?.en?.entry,
      source ? "source" : "built",
    );
    assert.equal(executions[marker], 1);
  });
}
