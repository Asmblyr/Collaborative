import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../dist/index.js";

test("extension client uses registry paths and preserves permission failures", async () => {
  const seen = [];
  const client = createClient({
    baseUrl: "https://example.test/api",
    accessToken: "admin-token",
    fetch: async (url, init) => {
      seen.push([url, init.method]);
      assert.equal(init.headers.get("authorization"), "Bearer admin-token");
      if (init.method === "POST") {
        return Response.json(
          { code: "ACCESS_DENIED", message: "Denied" },
          { status: 403 },
        );
      }
      return Response.json({ data: [], page: 1, limit: 20, total: 0 });
    },
  });
  assert.equal((await client.extensions.list({ status: "disabled" })).total, 0);
  await assert.rejects(client.extensions.enable("@example/plugin"), {
    status: 403,
  });
  assert.deepEqual(seen, [
    [
      "https://example.test/api/settings/extension-registry?status=disabled",
      "GET",
    ],
    [
      "https://example.test/api/settings/extension-registry/%40example%2Fplugin/enable",
      "POST",
    ],
  ]);
});
