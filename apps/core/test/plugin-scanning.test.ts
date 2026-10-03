import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { scanApiRoutes, scanCollectionFiles } from "@asmblyr/kit/node";

async function fixture(t: TestContext, files: string[]) {
  const base = fileURLToPath(new URL("../../../.tmp/", import.meta.url));
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "route-scan-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(base));
    await rm(root, { recursive: true, force: true });
  });
  for (const file of files) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "export default () => null;");
  }
  return root;
}

test("file routing maps index, methods and nested parameters", async (t) => {
  const root = await fixture(t, [
    "comments/index.get.ts",
    "comments/index.post.ts",
    "comments/[id].delete.ts",
    "comments/[id]/replies/index.get.ts",
    "comments/readme.md",
    "comments/types.d.ts",
  ]);
  const routes = await scanApiRoutes(root);
  assert.deepEqual(routes.map(({ method, path }) => `${method} ${path}`).sort(), [
    "DELETE /comments/:id",
    "GET /comments",
    "GET /comments/:id/replies",
    "POST /comments",
  ]);
});

test("a file without a method handles all five supported verbs", async (t) => {
  const root = await fixture(t, ["comments/status.ts"]);
  assert.deepEqual(
    (await scanApiRoutes(root)).map((route) => route.method),
    ["GET", "POST", "PUT", "PATCH", "DELETE"],
  );
});

test("ambiguous route files fail with both filenames", async (t) => {
  for (const files of [
    ["comments/[id].get.ts", "comments/[key].get.ts"],
    ["comments.get.ts", "comments/index.get.ts"],
    ["comments/status.ts", "comments/status.get.ts"],
  ]) {
    const root = await fixture(t, files);
    await assert.rejects(scanApiRoutes(root), (error: Error) => {
      assert.match(error.message, /Duplicate/);
      for (const file of files) assert.ok(error.message.includes(file));
      return true;
    });
  }
});

test("unsupported names and dynamic root namespaces are rejected", async (t) => {
  for (const file of [
    "index.get.ts",
    "[root]/index.get.ts",
    "api/comments.get.ts",
    "comments/[...slug].get.ts",
    "comments/[[id]].get.ts",
    "comments/[id]/[id].get.ts",
    "comments/status.options.ts",
  ]) {
    const root = await fixture(t, [file]);
    await assert.rejects(scanApiRoutes(root));
  }
});

test("a missing API directory is valid and deleted files disappear on rescan", async (t) => {
  const root = await fixture(t, ["comments/status.get.ts"]);
  assert.equal((await scanApiRoutes(root)).length, 1);
  await rm(path.join(root, "comments/status.get.ts"));
  assert.deepEqual(await scanApiRoutes(root), []);
  assert.deepEqual(await scanApiRoutes(path.join(root, "missing")), []);
});

test("collection scanning includes declarations only and rejects nested or ambiguous files", async (t) => {
  const root = await fixture(t, ["entries.ts", "readme.md", "types.d.ts"]);
  assert.deepEqual(await scanCollectionFiles(root), ["entries.ts"]);
  assert.deepEqual(await scanCollectionFiles(path.join(root, "absent")), []);
  await writeFile(path.join(root, "Invalid.ts"), "export default {};");
  await assert.rejects(scanCollectionFiles(root), /Invalid collection filename/);
  await rm(path.join(root, "Invalid.ts"));
  await mkdir(path.join(root, "nested"));
  await assert.rejects(scanCollectionFiles(root), /directly/);
});
