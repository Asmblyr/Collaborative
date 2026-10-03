import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const builder = fileURLToPath(
  new URL("../../../packages/kit/bin/plugin.mjs", import.meta.url),
);

test("build generates routes, removes stale output and preserves the last build on source errors", async (t) => {
  const base = fileURLToPath(new URL("../../../.tmp/", import.meta.url));
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "plugin-build-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(base));
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "build-fixture",
      type: "module",
      asmblyr: {
        manifest: {
          version: 1,
          namespace: "buildfixture",
          capabilities: ["collections.manage", "settings", "hooks.items"],
        },
      },
      exports: {
        "./collections": "./dist/collections.json",
        "./hooks": "./dist/hooks.json",
        "./settings": "./dist/server/settings.js",
      },
    }),
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        strict: true,
        types: [],
        rootDir: ".",
        outDir: "dist",
        declaration: true,
      },
      include: ["plugin.ts", "server/**/*.ts"],
    }),
  );
  await writeFile(path.join(root, "plugin.ts"), "export default {};");
  const api = path.join(root, "server/api/comments");
  const collections = path.join(root, "server/collections");
  await mkdir(collections, { recursive: true });
  await writeFile(
    path.join(collections, "entries.ts"),
    "export default { name: 'entries' };",
  );
  await mkdir(path.join(root, "server/hooks"));
  await writeFile(
    path.join(root, "server/hooks/created.ts"),
    "export default { event: 'items.create', handle() {} };",
  );
  await writeFile(
    path.join(root, "server/settings.ts"),
    "export default { title: 'Test', fields: { enabled: { type: 'boolean', label: 'Enabled', default: true } } };",
  );
  await mkdir(api, { recursive: true });
  await writeFile(
    path.join(api, "index.get.ts"),
    "export default () => ({ data: [] });",
  );
  const build = () =>
    execute(process.execPath, [builder, "build"], {
      cwd: root,
      windowsHide: true,
    });
  const index = path.join(root, "dist/routes.json");

  await build();
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, "dist/hooks.json"), "utf8")),
    ["./server/hooks/created.js"],
  );
  await stat(path.join(root, "dist/server/settings.js"));
  const collectionIndex = path.join(root, "dist/collections.json");
  assert.deepEqual(JSON.parse(await readFile(collectionIndex, "utf8")), [
    "./server/collections/entries.js",
  ]);
  await stat(path.join(root, "dist/server/collections/entries.js"));
  assert.deepEqual(JSON.parse(await readFile(index, "utf8")), [
    {
      method: "GET",
      path: "/comments",
      file: "./server/api/comments/index.get.js",
    },
  ]);
  await rm(path.join(api, "index.get.ts"));
  await rm(path.join(collections, "entries.ts"));
  await writeFile(
    path.join(api, "[id].get.ts"),
    "export default () => ({ data: true });",
  );
  await build();
  assert.deepEqual(JSON.parse(await readFile(collectionIndex, "utf8")), []);
  await assert.rejects(
    stat(path.join(root, "dist/server/collections/entries.js")),
    {
      code: "ENOENT",
    },
  );
  assert.equal(
    JSON.parse(await readFile(index, "utf8"))[0].path,
    "/comments/:id",
  );
  await assert.rejects(
    stat(path.join(root, "dist/server/api/comments/index.get.js")),
    {
      code: "ENOENT",
    },
  );

  const previous = await readFile(index, "utf8");
  await writeFile(
    path.join(api, "invalid.get.ts"),
    "export default { invalid: true };",
  );
  await assert.rejects(build(), /must default-export a handler/);
  assert.equal(await readFile(index, "utf8"), previous);
  await writeFile(
    path.join(api, "invalid.get.ts"),
    "const value: string = 42; export default () => value;",
  );
  await assert.rejects(build(), /not assignable/);
  assert.equal(await readFile(index, "utf8"), previous);
});
