import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TestContext } from "node:test";

export async function pluginPackageFixture(t: TestContext, names: string[]) {
  const base = fileURLToPath(new URL("../../../../.tmp/", import.meta.url));
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, "plugin-test-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(base));
    await rm(directory, { recursive: true, force: true });
  });
  const project = pathToFileURL(path.join(directory, "package.json"));
  await writeFile(project, JSON.stringify({ asmblyr: { plugins: names } }));
  return { directory, project };
}

export async function addPluginPackage(
  directory: string,
  name: string,
  version: number,
  source: string,
  namespace?: string,
) {
  const location = path.join(directory, "node_modules", name);
  await mkdir(location, { recursive: true });
  await writeFile(
    path.join(location, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: {
        ".": "./plugin.js",
        "./package.json": "./package.json",
        "./routes": "./routes.json",
        ...(namespace ? { "./collections": "./collections.json" } : {}),
      },
      asmblyr: { manifest: { version, namespace } },
    }),
  );
  await writeFile(path.join(location, "plugin.js"), source);
  await writeFile(path.join(location, "routes.json"), "[]");
  if (namespace) {
    await writeFile(path.join(location, "collections.json"), "[]");
  }
  return location;
}
