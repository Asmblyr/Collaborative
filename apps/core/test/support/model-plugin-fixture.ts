import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** Real package resolution and compiler, isolated from project plugins. */
export async function modelPluginFixture(t: TestContext) {
  const base = fileURLToPath(new URL("../../../../.tmp/", import.meta.url));
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "model-plugin-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(base));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "node_modules/@asmblyr"), { recursive: true });
  await symlink(
    fileURLToPath(new URL("../../../../packages/kit", import.meta.url)),
    path.join(root, "node_modules/@asmblyr/kit"),
    "junction",
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "model-fixture",
      type: "module",
      asmblyr: { manifest: { version: 1, namespace: "example" } },
      exports: { "./collections": "./dist/collections.json" },
    }),
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        strict: true,
        skipLibCheck: true,
        types: [],
        rootDir: ".",
        outDir: "dist",
        resolveJsonModule: true,
        rewriteRelativeImportExtensions: true,
      },
      include: ["plugin.ts", "server/**/*.ts", "shared/**/*.ts"],
    }),
  );
  await writeFile(path.join(root, "plugin.ts"), "export default {};");
  await mkdir(path.join(root, "server/api/example"), { recursive: true });
  await mkdir(path.join(root, "shared"));
  const write = (file: string, source: string) =>
    writeFile(path.join(root, file), source);
  const build = () =>
    promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../../../packages/kit/bin/plugin.mjs", import.meta.url),
        ),
        "build",
      ],
      { cwd: root, windowsHide: true },
    );
  return { root, write, build };
}
