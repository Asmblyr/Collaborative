import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  generateSchemaTypes,
  parseSchemaSnapshot,
} from "../dist/schema/index.js";

const field = {
  name: "title",
  type: "string",
  nullable: false,
  read: true,
  create: true,
  update: true,
  requiredOnCreate: true,
  filterKind: "text",
};
const snapshot = {
  version: 1,
  hash: "a".repeat(64),
  collections: [
    {
      name: "articles",
      mode: "multiple",
      primaryKey: { name: "id", type: "uuid" },
      actions: { read: true, create: true, update: true, delete: false },
      fields: [
        {
          ...field,
          name: "id",
          create: false,
          update: false,
          requiredOnCreate: false,
        },
        field,
        {
          ...field,
          name: "status",
          enum: ["published", "draft"],
          requiredOnCreate: false,
        },
      ],
    },
  ],
};

test("generator separates required create, optional update, readonly key and nullable fields", () => {
  const output = generateSchemaTypes(snapshot);
  assert.match(output, /export interface Read/);
  assert.match(output, /"title": string/);
  assert.match(output, /"title"\?: string/);
  assert.match(output, /"status"\?: "published" \| "draft"/);
  assert.equal((output.match(/"id": string/g) ?? []).length, 1);
  assert.doesNotMatch(output, /JsonValue/);
  assert.equal(generateSchemaTypes(snapshot), output);
});
test("untrusted schemas cannot inject code or smuggle extra properties into snapshots", () => {
  assert.throws(() => parseSchemaSnapshot({ ...snapshot, token: "secret" }));
  const unsafe = structuredClone(snapshot);
  unsafe.collections[0].name = 'x"; process.exit()';
  assert.throws(() => generateSchemaTypes(unsafe));
  const unknown = structuredClone(snapshot);
  unknown.collections[0].fields[1].type = "Date";
  assert.throws(() => generateSchemaTypes(unknown));
  const invalidFilter = structuredClone(snapshot);
  invalidFilter.collections[0].fields[1].filterKind = "sql";
  assert.throws(() => generateSchemaTypes(invalidFilter), /filter kind/);
  const duplicate = structuredClone(snapshot);
  duplicate.collections[0].fields.push(field);
  assert.throws(() => generateSchemaTypes(duplicate));
  const invalidSource = structuredClone(snapshot);
  invalidSource.collections[0].sourceKind = "materialized-view";
  assert.throws(() => parseSchemaSnapshot(invalidSource), /read only/);
  invalidSource.collections[0].sourceKind = "unknown";
  assert.throws(() => parseSchemaSnapshot(invalidSource), /source kind/);
});

test("generated source compiles with standard TypeScript and rejects invalid writes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "asmblyr-sdk-schema-"));
  const require = createRequire(import.meta.url);
  const generated = structuredClone(snapshot);
  generated.collections[0].fields.push({
    ...field,
    name: "tags",
    type: "strings",
    enum: ["news", "guide"],
    requiredOnCreate: false,
  });
  generated.collections.push({
    name: "reports",
    mode: "multiple",
    sourceKind: "materialized-view",
    primaryKey: { name: "id", type: "uuid" },
    actions: { read: true, create: false, update: false, delete: false },
    fields: ["id", "title"].map((name) => ({
      ...field,
      name,
      create: false,
      update: false,
      requiredOnCreate: false,
    })),
  });
  generated.collections.push({
    name: "user_profiles",
    mode: "multiple",
    profileExtension: true,
    primaryKey: { name: "id", type: "uuid" },
    actions: { read: true, create: false, update: false, delete: false },
    fields: [
      {
        ...field,
        name: "id",
        create: false,
        update: false,
        requiredOnCreate: false,
      },
      { ...field, name: "bio", update: false },
    ],
  });
  generated.methods = [
    {
      namespace: "example",
      id: "calculate",
      path: "/example/calculate",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["short", "long"] },
          count: { type: "integer" },
        },
        required: ["mode", "count"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          total: { type: "number" },
          currency: { type: "string", const: "RUB" },
        },
        required: ["total", "currency"],
        additionalProperties: false,
      },
    },
  ];
  try {
    await writeFile(
      path.join(directory, "schema.ts"),
      generateSchemaTypes(generated),
    );
    await writeFile(
      path.join(directory, "consumer.ts"),
      `
import { createClient } from "@asmblyr-collaborative/sdk";
import type { Schema } from "./schema";
import { schema } from "./schema";
const client = createClient<Schema>({ baseUrl: "https://example.test" });
client.users.saveExtension("user_profiles", { bio: "Hello" });
client.users.extension("user_profiles").then(result => { const bio: string | undefined = result.data?.data?.bio; void bio; });
// @ts-expect-error Profile ownership forbids generic creation.
client.items.create("user_profiles", {bio: "wrong"});
// @ts-expect-error Consumer profile fields are closed by its generated schema.
client.users.saveExtension("user_profiles", {wrong: "field"});
const fluent = createClient({ baseUrl: "https://example.test", schema });
fluent.Articles.select(a => [a.title]).where(a => a.status.eq("published")).exec();
fluent.collection("reports").select(a => [a.title]).exec();
fluent.plugins.example.calculate({ mode: "short", count: 2 }).then(result => { const currency: "RUB" = result.currency; void currency; });
// @ts-expect-error Plugin input is required and typed.
fluent.plugins.example.calculate({ mode: "short" });
// @ts-expect-error Plugin enum remains closed.
fluent.plugins.example.calculate({ mode: "bad", count: 2 });
// @ts-expect-error Ordinary HTTP endpoints are not generated model methods.
fluent.plugins.example.download({});
// @ts-expect-error Unknown choice in fluent filters.
fluent.Articles.where(a => a.status.eq("missing"));
// @ts-expect-error Unsupported text range operator.
fluent.Articles.where(a => a.title.gte("x"));
client.items.create("articles", { title: "Example", tags: ["news"] });
client.items.update("articles", "id", { status: "published" });
client.items.list("reports", { fields: ["title"] });
client.items.get("reports", "id");
// @ts-expect-error Generated materialized collection has no create contract.
client.items.create("reports", {title: "Bad"});
// @ts-expect-error Generated materialized collection has no update contract.
client.items.update("reports", "id", {title: "Bad"});
// @ts-expect-error Delete capability is false for a materialized collection.
client.items.delete("reports", "id");
// @ts-expect-error A draft cannot mutate a materialized collection even with empty values.
client.items.commit("reports", {id: "id", values: {}});
// @ts-expect-error Delete capability also follows ordinary table permissions.
client.items.delete("articles", "id");
// @ts-expect-error Required create field.
client.items.create("articles", {});
// @ts-expect-error Primary key is managed by Core.
client.items.update("articles", "id", { id: "other" });
// @ts-expect-error Unknown choice.
client.items.update("articles", "id", { status: "missing" });
// @ts-expect-error Invalid multiselect element.
client.items.update("articles", "id", { tags: ["missing"] });
// @ts-expect-error Unknown collection.
client.items.get("other", "id");
`,
    );
    await writeFile(
      path.join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          skipLibCheck: true,
          paths: {
            "@asmblyr-collaborative/sdk": [
              fileURLToPath(new URL("../dist/index.d.ts", import.meta.url)),
            ],
          },
        },
        include: ["*.ts"],
      }),
    );
    execFileSync(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc"),
        "-p",
        path.join(directory, "tsconfig.json"),
      ],
      { stdio: "pipe" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runtime aliases handle colliding technical names and reserve no user collection names", () => {
  const copy = structuredClone(snapshot);
  copy.collections = ["a_b", "a__b", "items", "constructor"].map((name) => ({
    ...copy.collections[0],
    name,
  }));
  const output = generateSchemaTypes(copy);
  assert.match(output, /"AB": "a_b"/);
  assert.match(output, /"AB_2": "a__b"/);
  assert.match(output, /"Items": "items"/);
  assert.match(output, /"Constructor": "constructor"/);
});
