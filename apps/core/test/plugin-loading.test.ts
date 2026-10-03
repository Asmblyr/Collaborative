import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  pluginPackageFixture as fixture,
  addPluginPackage as addPackage,
} from "./support/plugin-package-fixture.js";
import { loadPlugins } from "../src/plugins/load.js";
import {
  parseEndpoint,
  parsePluginDefinition,
} from "../src/plugins/definition.js";

test("loads a built local workspace plugin through its package exports", async () => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const comments = plugins.find(
    (plugin) => plugin.name === "@asmblyr/plugin-comments",
  );
  assert.ok(comments);
  assert.deepEqual(
    plugins.map((plugin) => plugin.name),
    ["@asmblyr/plugin-comments"],
  );
  assert.deepEqual(comments.definition, {});
  assert.ok(
    comments.endpoints.some(
      (endpoint) => endpoint.path === "/comments/:collection/:item",
    ),
  );
  assert.ok(
    comments.endpoints.some(
      (endpoint) => endpoint.path === "/comments/:collection/:item",
    ),
  );
  assert.equal(comments.migrations?.length, 1);
  assert.equal(comments.hasUi, true);
  assert.deepEqual(
    comments.hooks?.map((hook) => hook.definition.event),
    ["collections.delete", "items.delete"],
  );
  assert.equal(comments.settings?.fields.maxLength.default, 10000);
  const source = (
    await loadPlugins(new URL("../../../package.json", import.meta.url), {
      sourcePlugins: true,
    })
  ).find((plugin) => plugin.namespace === "comments")!;
  assert.deepEqual(comments.settings, source.settings);
  assert.deepEqual(
    comments.hooks?.map((hook) => hook.id),
    source.hooks?.map((hook) => hook.id),
  );
});

test("ordinary installed packages use the same loader", async (t) => {
  const { directory, project } = await fixture(t, ["example-plugin"]);
  const location = await addPackage(
    directory,
    "example-plugin",
    1,
    "export default {};",
  );
  await mkdir(path.join(location, "server/api/example"), { recursive: true });
  await writeFile(
    path.join(location, "server/api/example/status.get.js"),
    "export default () => ({ data: true });",
  );
  await writeFile(
    path.join(location, "server/api/example/unbuilt.get.ts"),
    "throw new Error('source must not execute');",
  );
  await writeFile(
    path.join(location, "routes.json"),
    JSON.stringify([
      {
        method: "GET",
        path: "/example/status",
        file: "./server/api/example/status.get.js",
      },
    ]),
  );
  const [plugin] = await loadPlugins(project);
  assert.equal(plugin.name, "example-plugin");
  assert.equal(plugin.endpoints[0].path, "/example/status");
  assert.equal(plugin.endpoints.length, 1);
});

test("duplicate namespaces fail before importing either package", async (t) => {
  const { directory, project } = await fixture(t, ["one", "two"]);
  await addPackage(
    directory,
    "one",
    1,
    "throw new Error('must not execute')",
    "comments",
  );
  await addPackage(
    directory,
    "two",
    1,
    "throw new Error('must not execute')",
    "comments",
  );
  await assert.rejects(
    loadPlugins(project),
    (error: Error & { cause?: Error }) => {
      assert.match(error.cause?.message ?? "", /Duplicate plugin namespace/);
      return true;
    },
  );
});

test("compiled collection indexes reject traversal and duplicates", async (t) => {
  const { directory, project } = await fixture(t, ["example"]);
  const root = await addPackage(
    directory,
    "example",
    1,
    "export default {}",
    "example",
  );
  await mkdir(path.join(root, "server/collections"), { recursive: true });
  await writeFile(
    path.join(root, "server/collections/entries.js"),
    "throw new Error('must not execute')",
  );
  for (const entries of [
    ["./server/collections/../../../outside.js"],
    ["./server/collections/entries.js", "./server/collections/entries.js"],
  ]) {
    await writeFile(
      path.join(root, "collections.json"),
      JSON.stringify(entries),
    );
    await assert.rejects(
      loadPlugins(project),
      (error: Error & { cause?: Error }) => {
        assert.match(
          error.cause?.message ?? "",
          /Invalid compiled collection path|Duplicate collection/,
        );
        return true;
      },
    );
  }
});

for (const location of [
  "plugins/local",
  "packages/local",
  "examples/plugins/local",
]) {
  test(`development discovers source routes in ${location} without dist`, async (t) => {
    const { directory, project } = await fixture(t, ["local-plugin"]);
    const local = path.join(directory, location);
    await mkdir(path.join(local, "server/api/comments"), { recursive: true });
    await writeFile(
      path.join(local, "package.json"),
      JSON.stringify({
        name: "local-plugin",
        type: "module",
        asmblyr: { manifest: { version: 1 } },
        exports: {
          ".": "./dist/plugin.js",
          "./package.json": "./package.json",
          "./routes": "./dist/routes.json",
        },
      }),
    );
    await writeFile(path.join(local, "plugin.ts"), "export default {};");
    await writeFile(
      path.join(local, "server/api/comments/status.get.ts"),
      "export default () => ({ data: 'source' });",
    );
    await mkdir(path.join(directory, "node_modules"));
    await symlink(
      local,
      path.join(directory, "node_modules/local-plugin"),
      "junction",
    );

    const [plugin] = await loadPlugins(project, { sourcePlugins: true });
    assert.deepEqual(plugin.definition, {});
    assert.equal(plugin.endpoints[0].path, "/comments/status");
    await assert.rejects(loadPlugins(project), /Cannot load plugin/);
  });
}

test("compiled route indexes cannot reference outside server/api", async (t) => {
  const { directory, project } = await fixture(t, ["example-plugin"]);
  const location = await addPackage(
    directory,
    "example-plugin",
    1,
    "export default {};",
  );
  await writeFile(
    path.join(location, "routes.json"),
    JSON.stringify([
      {
        method: "GET",
        path: "/example/status",
        file: "./server/api/../../../outside.js",
      },
    ]),
  );
  await assert.rejects(
    loadPlugins(project),
    (error: Error & { cause?: Error }) => {
      assert.match(error.cause?.message ?? "", /invalid compiled handler path/);
      return true;
    },
  );
});

test("a route file must default-export a function", async (t) => {
  const { directory, project } = await fixture(t, ["example-plugin"]);
  const location = await addPackage(
    directory,
    "example-plugin",
    1,
    "export default {};",
  );
  await mkdir(path.join(location, "server/api/example"), { recursive: true });
  await writeFile(
    path.join(location, "server/api/example/status.get.js"),
    "export default {};",
  );
  await writeFile(
    path.join(location, "routes.json"),
    JSON.stringify([
      {
        method: "GET",
        path: "/example/status",
        file: "./server/api/example/status.get.js",
      },
    ]),
  );
  await assert.rejects(loadPlugins(project), /invalid endpoint/);
});

test("all manifests are checked before executing any package", async (t) => {
  const { directory, project } = await fixture(t, [
    "first-plugin",
    "invalid-plugin",
  ]);
  await addPackage(
    directory,
    "first-plugin",
    1,
    "throw new Error('must not execute');",
  );
  await addPackage(directory, "invalid-plugin", 2, "export default {};");
  await assert.rejects(
    loadPlugins(project),
    (error: Error & { cause?: Error }) => {
      assert.match(error.message, /invalid-plugin/);
      assert.match(error.cause?.message ?? "", /manifest.version 1/);
      return true;
    },
  );
});

test("duplicate and non-package entries fail before resolving modules", async (t) => {
  for (const names of [["same", "same"], ["../outside"], ["node:fs"]]) {
    const { project } = await fixture(t, names);
    await assert.rejects(loadPlugins(project), /Duplicate|npm package names/);
  }
});

test("malformed definitions, wildcards and /api paths are rejected", () => {
  for (const value of [
    null,
    [],
    { unknown: true },
    { endpoints: {} },
    { actions: [] },
  ]) {
    assert.throws(() => parsePluginDefinition(value, "example"));
  }
  for (const route of [
    "/api/comments",
    "/comments/*",
    "/:root",
    "/comments/../users",
    "//comments",
    "/comments?x=1",
  ]) {
    assert.throws(() =>
      parseEndpoint(
        { method: "GET", path: route, handler: () => null },
        "example",
      ),
    );
  }
});
