import assert from "node:assert/strict";
import test from "node:test";
import type { UiPluginDefinition } from "@asmblyr-collaborative/kit/ui";
import {
  createUiPluginLoader,
  watchUiPlugins,
  type UiPluginModule,
} from "../src/components/plugins/registry-loader";

test("a disabled module finishing late cannot publish an old activation", async () => {
  let resolve!: (module: { default: UiPluginDefinition }) => void;
  const loader = createUiPluginLoader([
    {
      packageName: "slow",
      namespace: "slow",
      load: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  ]);
  let staleWrites = 0;
  let currentNames: string[] = ["slow"];
  const cancel = watchUiPlugins(loader, ["slow"], () => {
    staleWrites += 1;
  });
  await Promise.resolve();
  cancel();
  watchUiPlugins(loader, [], (result) => {
    currentNames = result.plugins.map((entry) => entry.packageName);
  });
  resolve({ default: {} });
  await new Promise(setImmediate);
  assert.equal(staleWrites, 0);
  assert.deepEqual(currentNames, []);
});

test("StrictMode cleanup does not prevent the next effect from receiving its pending import", async () => {
  let imports = 0;
  let resolve!: (module: { default: UiPluginDefinition }) => void;
  const loader = createUiPluginLoader([
    {
      packageName: "demo",
      namespace: "demo",
      load: () => {
        imports += 1;
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
  ]);
  const cancel = watchUiPlugins(loader, ["demo"], () =>
    assert.fail("cleaned-up effect must not publish"),
  );
  cancel();
  let received = 0;
  watchUiPlugins(loader, ["demo"], (result) => {
    received = result.plugins.length;
  });
  await Promise.resolve();
  resolve({ default: {} });
  await new Promise(setImmediate);
  assert.equal(imports, 1);
  assert.equal(received, 1);
});

test("disabled and unknown UI packages are never imported", async () => {
  let imports = 0;
  const loader = createUiPluginLoader([
    {
      packageName: "constructor",
      namespace: "demo",
      load: async () => {
        imports += 1;
        throw new Error("must not execute");
      },
    },
  ]);
  assert.deepEqual(await loader.load([]), { plugins: [], failed: [] });
  assert.deepEqual(await loader.load(["unknown"]), { plugins: [], failed: [] });
  assert.equal(imports, 0);
});

test("a failing UI entry does not prevent healthy modules from loading", async () => {
  const good: UiPluginModule = {
    packageName: "good",
    namespace: "good",
    load: async () => ({ default: {} }),
  };
  const bad: UiPluginModule = {
    packageName: "bad",
    namespace: "bad",
    load: async () => {
      throw new Error("entry crashed");
    },
  };
  const result = await createUiPluginLoader([bad, good]).load(["bad", "good"]);
  assert.deepEqual(
    result.plugins.map((entry) => entry.packageName),
    ["good"],
  );
  assert.deepEqual(result.failed, [{ packageName: "bad", namespace: "bad" }]);
});

test("concurrent and repeated loads share a single import, including StrictMode effects", async () => {
  let imports = 0;
  let resolve!: (module: { default: UiPluginDefinition }) => void;
  const loader = createUiPluginLoader([
    {
      packageName: "demo",
      namespace: "demo",
      load: () => {
        imports += 1;
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
  ]);
  const first = loader.load(["demo"]);
  const second = loader.load(["demo"]);
  await Promise.resolve();
  assert.equal(imports, 1);
  resolve({ default: {} });
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one.plugins[0], two.plugins[0]);
  assert.equal((await loader.load(["demo"])).plugins[0], one.plugins[0]);
  assert.equal(imports, 1);
  assert.deepEqual(await loader.load([]), { plugins: [], failed: [] });
});

test("failed module imports may be retried without caching failure forever", async () => {
  let attempts = 0;
  const loader = createUiPluginLoader([
    {
      packageName: "demo",
      namespace: "demo",
      load: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary chunk failure");
        }
        return { default: {} };
      },
    },
  ]);
  assert.equal((await loader.load(["demo"])).failed.length, 1);
  assert.equal((await loader.load(["demo"])).plugins.length, 1);
  assert.equal(attempts, 2);
});
