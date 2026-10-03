import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadPlugins } from "../src/plugins/load.js";
import { parseMigration } from "../src/plugins/migration-index.js";

test("source and compiled plans have identical checksums; JSON object key order is irrelevant", async () => {
  const project = new URL("../../../package.json", import.meta.url);
  const source = await loadPlugins(project, { sourcePlugins: true });
  const built = await loadPlugins(project);
  assert.deepEqual(source[0].migrations, built[0].migrations);
  const name = "20261002000000_index";
  const first = parseMigration(
    {
      operations: [
        {
          type: "addIndex",
          collection: "entries",
          name: "by_id",
          fields: ["id"],
        },
      ],
    },
    name,
  );
  const second = parseMigration(
    {
      operations: [
        {
          fields: ["id"],
          name: "by_id",
          collection: "entries",
          type: "addIndex",
        },
      ],
    },
    name,
  );
  assert.equal(first.checksum, second.checksum);
  assert.throws(
    () =>
      parseMigration(
        { operations: [{ type: "sql", sql: "DROP TABLE anything" }] },
        name,
      ),
    /Invalid/,
  );
  assert.throws(
    () =>
      parseMigration(
        {
          operations: [
            {
              type: "addIndex",
              collection: "entries",
              name: "bad",
              fields: ["id", "id"],
            },
          ],
        },
        name,
      ),
    /Invalid/,
  );
});

test("browser kit entry has no server runtime dependency", async () => {
  const source = await readFile(
    new URL("../../../packages/kit/dist/ui.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from ["'](?:h3|node:|\.\/index)/);
});
