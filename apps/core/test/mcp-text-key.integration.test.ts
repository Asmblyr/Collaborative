import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { authorize, grantWrites, sdk } from "./support/external-mcp-client.js";

test("MCP keeps native text-key creation and updates without requiring a primary-key field grant", async (t) => {
  const fixture = await mcpFixture(t);
  const collection = fixture.names.people;
  await grantWrites(fixture, collection);
  const auth = await authorize(fixture, true);
  const external = await sdk(fixture, auth.tokens.access_token);
  t.after(() => external.client.close());
  const described = await external.tool("describe_collection", { collection });
  assert.deepEqual(described.primaryKey, { name: "code", type: "text" });
  const args = {
    collection,
    values: { code: "external-text-key", title: "Text key record" },
    operationId: randomUUID(),
  };
  const created = await external.tool("create_item", args);
  assert.equal(created.applied, true, JSON.stringify(created));
  assert.equal(created.id, "external-text-key");
  assert.equal((await external.tool("create_item", args)).replayed, true);
  const prepared = await external.tool("prepare_update", {
    collection,
    id: "external-text-key",
    values: { title: "Updated text key" },
  });
  const updated = await external.tool("update_item", {
    collection,
    id: "external-text-key",
    values: { title: "Updated text key" },
    expectedValues: prepared.expectedValues,
    operationId: randomUUID(),
  });
  assert.equal(updated.applied, true, JSON.stringify(updated));
  assert.equal(
    (
      await fixture
        .db(collection)
        .where({ code: "external-text-key" })
        .first("title")
    ).title,
    "Updated text key",
  );
});
