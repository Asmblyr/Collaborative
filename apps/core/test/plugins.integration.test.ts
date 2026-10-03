import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { useAsmblyr } from "@asmblyr/kit";
import { loadPlugins } from "../src/plugins/load.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("a plugin reads articles with the caller's permissions and rejects a revoked session", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const example = {
    name: "articles-example",
    capabilities: ["items.read" as const],
    definition: {},
    endpoints: [
      {
        method: "GET" as const,
        path: "/example/articles",
        handler: (event: Parameters<typeof useAsmblyr>[0]) =>
          useAsmblyr(event).items.list("articles", {
            fields: ["id", "title"],
            limit: 20,
          }),
      },
    ],
  };
  const fixture = await pluginItemsFixture({
    collection: "articles",
    plugins: [...plugins, example],
  });
  t.after(fixture.close);
  const { app, db, member, memberToken, outsiderToken } = fixture;
  const url = "/example/articles";
  const headers = {
    authorization: `Bearer ${memberToken}`,
    "x-asmblyr-plugin-route": "1",
  };

  assert.equal((await app.inject({ url })).statusCode, 401);
  const forbidden = await app.inject({
    url,
    headers: { ...headers, authorization: `Bearer ${outsiderToken}` },
  });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  const success = await app.inject({ url, headers });
  assert.equal(success.statusCode, 200, success.body);
  assert.deepEqual(success.json().data, [
    { id: 1, title: "Bravo" },
    { id: 2, title: "Alpha" },
    { id: 3, title: "Charlie" },
  ]);

  await db("asmblyr_auth_sessions")
    .withSchema("public")
    .where({ user_id: member.id })
    .update({ revoked_at: db.fn.now() });
  assert.equal((await app.inject({ url, headers })).statusCode, 401);
});
