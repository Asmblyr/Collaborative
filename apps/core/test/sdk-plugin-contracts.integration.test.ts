import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createClient, defineSchema } from "@asmblyr-collaborative/sdk";
import {
  parseSchemaSnapshot,
  generateSchemaTypes,
} from "@asmblyr-collaborative/sdk/schema";
import { modelDataPlugin } from "./support/model-data-plugin.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("schema exports existing model contracts by access gate; SDK invokes the original permission-checked HTTP handler", async (t) => {
  const plugin = await modelDataPlugin(t);
  const fixture = await pluginItemsFixture({ plugins: [plugin] });
  t.after(fixture.close);
  const { app, call, memberToken, adminToken, collection, member, grant } =
    fixture;
  const snapshot = (await call("GET", "/schema", undefined, 200, memberToken))
    .data;
  assert.deepEqual(
    snapshot.methods.map((method: { id: string }) => method.id),
    ["data", "readonly"],
  );
  assert.ok(!JSON.stringify(snapshot.methods).includes('"admin"'));
  assert.ok(
    !snapshot.methods.some(
      (method: { namespace: string }) => method.namespace === "reader",
    ),
  );
  const admin = (await call("GET", "/schema", undefined, 200, adminToken)).data;
  assert.ok(
    admin.methods.some((method: { id: string }) => method.id === "admin"),
  );
  const parsed = parseSchemaSnapshot(snapshot);
  assert.equal(
    createHash("sha256")
      .update(
        JSON.stringify({
          version: 1,
          collections: parsed.collections,
          methods: parsed.methods,
        }),
      )
      .digest("hex"),
    snapshot.hash,
  );
  assert.match(generateSchemaTypes(snapshot), /export interface PluginMethods/);
  assert.match(generateSchemaTypes(snapshot), /"operation":/);
  await app.listen({ port: 0, host: "127.0.0.1" });
  type Input = {
    collection: string;
    id: string;
    field: string;
    value: string | null;
    operation: "get" | "update";
  };
  const schema = defineSchema<
    Record<never, never>,
    { example: { data: { input: Input; output: { data: string } } } }
  >()({}, {}, { example: { data: "/example/data" } });
  const client = createClient({
    baseUrl: app.listeningOrigin!,
    accessToken: memberToken,
    schema,
  });
  const input: Input = {
    collection,
    id: "1",
    field: "title",
    value: "SDK",
    operation: "update",
  };
  await assert.rejects(
    client.plugins.example.data(input),
    (error) => (error as { status: number }).status === 403,
  );
  await grant(collection, ["title"], member.id, "update");
  const result = await client.plugins.example.data(input);
  assert.ok(typeof result.data === "string");
  assert.doesNotMatch(result.data, /classified|secret/);
  await assert.rejects(
    client.plugins.example.data({ ...input, field: "secret" }),
    (error) => (error as { status: number }).status === 403,
  );
});
