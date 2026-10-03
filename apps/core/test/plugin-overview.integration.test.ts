import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { loadPlugins } from "../src/plugins/load.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("overview uses the authenticated viewer and requires no collection privileges for their own context", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../examples/plugins/package.json", import.meta.url),
    {
      sourcePlugins: true,
    },
  );
  const plugin = plugins.find((entry) => entry.namespace === "overview");
  assert.ok(plugin);
  const fixture = await pluginItemsFixture({ plugins: [plugin] });
  t.after(fixture.close);
  const { call, db, member, outsider, memberToken, outsiderToken } = fixture;
  await db("asmblyr_users")
    .where({ id: member.id })
    .update({ display_name: "Обзор участника" });
  await call("GET", "/overview/session", undefined, 401, null);

  const own = await call(
    "GET",
    "/overview/session",
    undefined,
    200,
    memberToken,
  );
  assert.deepEqual(own.viewer, {
    id: member.id,
    kind: "user",
    displayName: "Обзор участника",
  });
  assert.ok(Number.isFinite(Date.parse(own.checkedAt)));
  const other = await call(
    "GET",
    `/overview/session?actor=${member.id}`,
    undefined,
    200,
    outsiderToken,
  );
  assert.equal(other.viewer.id, outsider.id);
  const extensions = await call(
    "GET",
    "/extensions",
    undefined,
    200,
    memberToken,
  );
  assert.ok(
    extensions.data.some(
      (entry: { name: string }) => entry.name === plugin.name,
    ),
  );
});
