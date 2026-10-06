import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../dist/index.js";
test("user profile and typed extension use the authenticated client transport", async () => {
  const calls = [];
  const client = createClient({
    baseUrl: "https://example.test",
    accessToken: "test",
    fetch: async (url, options) => {
      calls.push([
        new URL(url).pathname,
        options.method,
        options.body && JSON.parse(options.body),
      ]);
      assert.equal(options.headers.get("authorization"), "Bearer test");
      return Response.json({
        data: new URL(url).pathname.endsWith("/extension")
          ? {
              collection: "profiles",
              userId: "id",
              exists: true,
              data: { bio: "Hello" },
            }
          : {},
      });
    },
  });
  await client.users.updateMe({ firstName: "Ivan", description: null });
  await client.users.updatePreferences({ timezone: "UTC" });
  assert.equal(
    (await client.users.extension("profiles")).data.data.bio,
    "Hello",
  );
  await client.users.saveExtension("profiles", { bio: "Updated" });
  assert.deepEqual(calls, [
    ["/users/me", "PATCH", { firstName: "Ivan", description: null }],
    ["/users/me/preferences", "PATCH", { timezone: "UTC" }],
    ["/users/me/extension", "GET", undefined],
    [
      "/users/me/extension",
      "PATCH",
      { collection: "profiles", values: { bio: "Updated" } },
    ],
  ]);
  await assert.rejects(client.users.extension("wrong"), /differs from/);
});
