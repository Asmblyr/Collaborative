import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { HTTPMethods } from "fastify";
import { oauthFixture } from "./support/oauth-provider.js";

test("every documented protected Core route rejects an anonymous request", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../../../docs/reference/endpoints.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { public: boolean }>;
  const fixture = await oauthFixture();
  const denied: string[] = [];
  try {
    for (const [key, entry] of Object.entries(catalog)) {
      if (entry.public) {
        continue;
      }
      const [method, template] = key.split(" ");
      const url = template.replace(
        /:([A-Za-z0-9_]+)/g,
        (_match, name: string) =>
          ["collection", "name", "field", "namespace"].includes(name)
            ? "audit_collection"
            : "00000000-0000-4000-8000-000000000001",
      );
      const result = await fixture.app.inject({
        method: method as HTTPMethods,
        url,
        ...(["POST", "PUT", "PATCH"].includes(method) ? { payload: {} } : {}),
      });
      if (result.statusCode !== 401) {
        denied.push(`${key}: expected 401, received ${result.statusCode}`);
      }
    }
    assert.deepEqual(denied, []);
  } finally {
    await fixture.close();
  }
});
