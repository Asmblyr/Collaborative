import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { tagLimits } from "@asmblyr-collaborative/contracts";
import {
  generateSchemaTypes,
  parseSchemaSnapshot,
} from "@asmblyr-collaborative/sdk/schema";
import { featureFixture } from "./support/feature-fixture.js";

test("tags: validated JSON writes, legacy preservation and freeform SDK types", async (t) => {
  const f = await featureFixture();
  const name = `${f.prefix}_tags`;
  f.names.push(name);
  const { call, db } = f;
  const configuration = (field: string) =>
    `/collections/${name}/fields/${field}/configuration`;
  const presentation = (field: string) =>
    `/collections/${name}/fields/${field}/presentation`;
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "legacy", type: "json" },
        ],
      },
      201,
    );
    const legacy = { mixed: ["keep", 2] };
    const old = await call(
      "POST",
      `/items/${name}`,
      { title: "Original", legacy },
      201,
    );
    await t.test(
      "presentation does not rewrite old records or change SQL storage",
      async () => {
        await call("PUT", presentation("legacy"), { interface: "tags" });
        assert.deepEqual(
          (await call("GET", `/items/${name}/${old.id}`)).legacy,
          legacy,
        );
        await call("PATCH", `/items/${name}/${old.id}`, {
          title: "Unrelated edit",
        });
        assert.deepEqual(
          (await call("GET", `/items/${name}/${old.id}`)).legacy,
          legacy,
        );
        const info = await db("information_schema.columns")
          .where({
            table_schema: "public",
            table_name: name,
            column_name: "legacy",
          })
          .first();
        assert.equal(info.data_type, "jsonb");
        await call("PUT", presentation("title"), { interface: "tags" }, 400);
        await call(
          "PUT",
          presentation("legacy"),
          { interface: "tags", options: [{ value: "x", label: "X" }] },
          400,
        );
      },
    );
    await t.test(
      "field creation and defaults are atomic and normalized",
      async () => {
        for (const defaultValue of [
          [],
          [" ", "a"],
          ["a", " a "],
          { invalid: true },
        ]) {
          await call(
            "POST",
            configuration("invalid"),
            {
              field: {
                name: "invalid",
                type: "json",
                required: true,
                defaultValue,
              },
              presentation: { interface: "tags" },
            },
            400,
          );
          assert.equal((await db(name).columnInfo()).invalid, undefined);
        }
        await call(
          "POST",
          configuration("tags"),
          {
            field: {
              name: "tags",
              type: "json",
              required: true,
              defaultValue: [" Default "],
            },
            presentation: { interface: "tags" },
          },
          201,
        );
        const row = await call("POST", `/items/${name}`, {}, 201);
        assert.deepEqual(row.tags, ["Default"]);
        await call(
          "PUT",
          configuration("tags"),
          {
            field: { defaultValue: [" "] },
            presentation: { interface: "tags" },
          },
          400,
        );
        assert.deepEqual((await call("POST", `/items/${name}`, {}, 201)).tags, [
          "Default",
        ]);
      },
    );
    const row = await call(
      "POST",
      `/items/${name}`,
      { tags: [" Kraft ", "Heinz", "крафт", "KRAFT"] },
      201,
    );
    await t.test(
      "API preserves case and order, trims and rejects invalid writes without partial changes",
      async () => {
        assert.deepEqual(row.tags, ["Kraft", "Heinz", "крафт", "KRAFT"]);
        const invalid = [
          null,
          [],
          "text",
          {},
          [1],
          [""],
          [" "],
          ["a", " a "],
          ["line\nbreak"],
          ["a\0b"],
          ["x".repeat(tagLimits.length + 1)],
          Array.from({ length: tagLimits.count + 1 }, (_, index) =>
            String(index),
          ),
        ];
        for (const tags of invalid) {
          await call(
            "PATCH",
            `/items/${name}/${row.id}`,
            { tags, title: "Should roll back" },
            400,
          );
          await call("POST", `/items/${name}`, { tags }, 400);
        }
        const kept = await call("GET", `/items/${name}/${row.id}`);
        assert.deepEqual(kept.tags, row.tags);
        assert.equal(kept.title, null);
        const boundary = Array.from({ length: tagLimits.count }, (_, index) =>
          `${index}`.padEnd(tagLimits.length, "x"),
        );
        assert.deepEqual(
          (await call("PATCH", `/items/${name}/${row.id}`, { tags: boundary }))
            .tags,
          boundary,
        );
        await call(
          "POST",
          `/items/${name}/commit`,
          { id: row.id, values: { title: "Rollback", tags: ["x", "x"] } },
          400,
        );
        assert.equal(
          (await call("GET", `/items/${name}/${row.id}`)).title,
          null,
        );
      },
    );
    await t.test(
      "optional tags allow empty arrays and null; invalid legacy values can be corrected explicitly",
      async () => {
        await call("PATCH", `/items/${name}/${old.id}`, { legacy: [] });
        assert.deepEqual(
          (await call("GET", `/items/${name}/${old.id}`)).legacy,
          [],
        );
        await call("PATCH", `/items/${name}/${old.id}`, { legacy: null });
        assert.equal(
          (await call("GET", `/items/${name}/${old.id}`)).legacy,
          null,
        );
        await call("PATCH", `/items/${name}/${old.id}`, { legacy: ["new"] });
      },
    );
    await t.test(
      "permission scoped schema generates string arrays without a closed enum",
      async () => {
        await f.grant(name, "read", ["tags", "legacy"]);
        await f.grant(name, "create", ["tags"]);
        const schema = parseSchemaSnapshot(
          await call("GET", "/schema", undefined, 200, f.memberHeaders),
        );
        const collection = schema.collections.find(
          (entry) => entry.name === name,
        )!;
        const tags = collection.fields.find((entry) => entry.name === "tags")!;
        const optional = collection.fields.find(
          (entry) => entry.name === "legacy",
        )!;
        assert.equal(tags.type, "strings");
        assert.equal(tags.enum, undefined);
        assert.equal(tags.nullable, false);
        assert.equal(tags.filterKind, "none");
        assert.equal(tags.update, false);
        assert.equal(optional.type, "strings");
        assert.equal(optional.nullable, true);
        assert.ok(!collection.fields.some((entry) => entry.name === "title"));
        const source = generateSchemaTypes(schema);
        assert.match(source, /"tags"\??: string\[\]/);
        assert.match(source, /"legacy"\??: string\[\] \| null/);
        await call("PUT", presentation("legacy"), {});
        const reset = parseSchemaSnapshot(
          await call("GET", "/schema", undefined, 200, f.memberHeaders),
        );
        assert.notEqual(reset.hash, schema.hash);
        assert.equal(
          reset.collections
            .find((entry) => entry.name === name)!
            .fields.find((entry) => entry.name === "legacy")!.type,
          "json",
        );
      },
    );
  } finally {
    await f.close();
  }
});
