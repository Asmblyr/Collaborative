import assert from "node:assert/strict";
import test from "node:test";
import { createClient, defineSchema } from "../dist/index.js";
import { generateSchemaTypes } from "../dist/schema/index.js";

test("plugin consumer methods use their original static POST path and output envelope", async () => {
  const schema = defineSchema()(
    {},
    {},
    { example: { calculate: "/example/calculate" } },
  );
  let calls = 0;
  const client = createClient({
    baseUrl: "https://example.test/api",
    schema,
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://example.test/api/example/calculate");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { count: 2 });
      return Response.json({
        data: {
          namespace: "example",
          actionId: "calculate",
          output: { total: 20 },
        },
      });
    },
  });
  assert.deepEqual(await client.plugins.example.calculate({ count: 2 }), {
    total: 20,
  });
  await assert.rejects(
    client.plugins.example.calculate(
      { count: 2 },
      { signal: AbortSignal.abort() },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  assert.throws(() =>
    defineSchema()({}, {}, { example: { calculate: "/auth/logout" } }),
  );
});
test("untrusted plugin schema refuses code injection, open objects, refs and mismatching paths", () => {
  const object = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  };
  const snapshot = {
    version: 1,
    hash: "a".repeat(64),
    collections: [],
    methods: [
      {
        namespace: "example",
        id: "calculate",
        path: "/example/calculate",
        inputSchema: object,
        outputSchema: object,
      },
    ],
  };
  assert.match(generateSchemaTypes(snapshot), /PluginMethods/);
  for (const inputSchema of [
    { ...object, $ref: "remote" },
    { ...object, additionalProperties: true },
    { ...object, default: "secret" },
    {
      ...object,
      properties: { value: { type: "number", const: Infinity } },
      required: ["value"],
    },
    {
      ...object,
      properties: { value: { type: "number", enum: [NaN] } },
      required: ["value"],
    },
    {
      ...object,
      properties: { injection: { type: "process.exit()" } },
      required: ["injection"],
    },
  ]) {
    assert.throws(() =>
      generateSchemaTypes({
        ...snapshot,
        methods: [{ ...snapshot.methods[0], inputSchema }],
      }),
    );
  }
  assert.throws(() =>
    generateSchemaTypes({
      ...snapshot,
      methods: [{ ...snapshot.methods[0], path: "/auth/logout" }],
    }),
  );
});
