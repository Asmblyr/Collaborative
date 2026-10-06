import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginNamespace } from "@asmblyr-collaborative/kit/node";
import { loadPlugins } from "../src/plugins/load.js";
import { parsePluginCollection } from "../src/plugins/collection-definition.js";

const definition = {
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  fields: { body: { type: "text", required: true, nullable: true } },
};

test("source and built collection discovery produce identical normalized definitions", async () => {
  const project = new URL("../../../package.json", import.meta.url);
  const source = await loadPlugins(project, { sourcePlugins: true });
  const built = await loadPlugins(project);
  assert.deepEqual(
    source.map((p) => p.collections),
    built.map((p) => p.collections),
  );
  const comments = built.find((p) => p.namespace === "comments");
  assert.equal(
    comments?.collections?.[0].input.name,
    "plugin_comments_entries",
  );
  assert.equal(comments?.collections?.[0].input.mcp.enabled, false);
  assert.equal(
    comments?.collections?.[0].presentation.body.interface,
    "textarea",
  );
});

test("namespace and declaration names reject reserved prefixes, ambiguity and PostgreSQL truncation", () => {
  for (const value of [
    "asmblyr",
    "asmblyr_auth",
    "plugin_comments",
    "Comments",
    "../comments",
    "",
    "a".repeat(32),
  ]) {
    assert.throws(() => parsePluginNamespace(value));
  }
  for (const name of [
    "asmblyr_users",
    "plugin_other_entries",
    "x".repeat(63),
  ]) {
    assert.throws(() =>
      parsePluginCollection({ ...definition, name }, "comments", name),
    );
  }
  assert.throws(
    () => parsePluginCollection(definition, "comments", "different"),
    /filename/,
  );
});

test("runtime parsing enforces declaration shape, API requirements and managed field names", () => {
  const parsed = parsePluginCollection(definition, "comments", "entries");
  assert.equal(parsed.input.fields[0].required, true);
  assert.equal(parsed.input.fields[0].nullable, true);
  const invalid = [
    { ...definition, fields: { body: { type: "text", required: true } } },
    {
      ...definition,
      fields: { id: { type: "uuid", required: true, nullable: false } },
    },
    {
      ...definition,
      fields: {
        body: {
          type: "boolean",
          required: false,
          nullable: false,
          defaultValue: "false",
        },
      },
    },
    {
      ...definition,
      fields: {
        body: {
          type: "boolean",
          required: false,
          nullable: false,
          presentation: { interface: "textarea" },
        },
      },
    },
    { ...definition, table: "asmblyr_users" },
    { ...definition, presentation: { superuser: true } },
  ];
  for (const value of invalid)
    assert.throws(() => parsePluginCollection(value, "comments", "entries"));
});
