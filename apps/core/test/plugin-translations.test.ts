import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readPluginTranslations } from "@asmblyr-collaborative/kit/node";
import { loadPlugins } from "../src/plugins/load.js";

test("plugin catalogs load equally from source and built packages", async () => {
  const project = new URL("../../../package.json", import.meta.url);
  const source = await loadPlugins(project, { sourcePlugins: true });
  const built = await loadPlugins(project);
  assert.deepEqual(
    source.map((p) => p.translations),
    built.map((p) => p.translations),
  );
  assert.equal(
    built.find((p) => p.namespace === "comments")?.translations?.en?.[
      "panel.title"
    ],
    "Discussion",
  );
});

test("optional plugin catalogs reject nested objects, unsafe keys and oversized messages", async (t) => {
  const base = path.resolve(
    fileURLToPath(new URL("../../../.tmp/", import.meta.url)),
  );
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "plugin-locales-"));
  t.after(async () => {
    assert.equal(path.dirname(root), base);
    await rm(root, { force: true, recursive: true });
  });
  assert.deepEqual(await readPluginTranslations(root), {});
  await mkdir(path.join(root, "locales"));
  for (const invalid of [
    "[]",
    '{"constructor":"bad"}',
    '{"nested":{"label":"Bad"}}',
    JSON.stringify({ title: "x".repeat(4001) }),
    '{"title":""}',
  ]) {
    await writeFile(path.join(root, "locales/ru.json"), invalid);
    await assert.rejects(readPluginTranslations(root));
  }
  await writeFile(path.join(root, "locales/ru.json"), '{"title":"Название"}');
  assert.deepEqual(await readPluginTranslations(root), {
    ru: { title: "Название" },
  });
});
