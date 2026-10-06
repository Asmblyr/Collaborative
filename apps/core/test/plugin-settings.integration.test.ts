import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { loadPlugins } from "../src/plugins/load.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("plugin settings validate, persist, reject conflicts and apply to the next request", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
  const google = plugins.find((plugin) => plugin.namespace === "google")!;
  const f = await pluginItemsFixture({ plugins: [comments, google] });
  t.after(async () => {
    await f.db("asmblyr_settings").where({ key: "plugin:comments" }).delete();
    await f.close();
  });
  await f.db("asmblyr_settings").where({ key: "plugin:comments" }).delete();
  const url = "/settings/plugins/comments";
  const target = `/comments/${f.collection}/1`;
  await f.call("GET", url, undefined, 401, null);
  await f.call("GET", url, undefined, 403, f.memberToken);
  await f.call("GET", "/settings/plugins", undefined, 403, f.memberToken);
  const catalog = (await f.call("GET", "/settings/plugins")).data;
  const googleEntry = catalog.find(
    (entry: { namespace: string }) => entry.namespace === "google",
  );
  assert.equal(googleEntry.title, "Google Workspace");
  assert.equal(googleEntry.settings, null);
  assert.equal(
    catalog.find(
      (entry: { namespace: string }) => entry.namespace === "comments",
    ).title,
    "Комментарии",
  );
  await f.call("GET", "/settings/plugins/missing", undefined, 404);
  const initial = (await f.call("GET", url)).data;
  assert.deepEqual(initial.values, {
    allowNewComments: true,
    maxLength: 10000,
  });
  assert.equal(initial.revision, null);
  const created = (
    await f.call("POST", target, { body: "Keep existing" }, 201, f.memberToken)
  ).data;
  for (const values of [
    { allowNewComments: true },
    { allowNewComments: "true", maxLength: 100 },
    { allowNewComments: true, maxLength: 99 },
    { allowNewComments: true, maxLength: 100.5 },
    { allowNewComments: true, maxLength: 100, arbitrary: true },
  ]) {
    await f.call("PUT", url, { values, revision: null }, 400);
  }
  const values = { allowNewComments: false, maxLength: 100 };
  await f.call("PUT", url, { values, revision: null }, 403, f.memberToken);
  const changed = (await f.call("PUT", url, { values, revision: null })).data;
  assert.match(changed.revision, /^[a-f0-9]{64}$/);
  await f.call("PUT", url, { values, revision: null }, 409);
  const listed = await f.call("GET", target, undefined, 200, f.memberToken);
  assert.equal(listed.canCreate, false);
  assert.equal(listed.maxLength, 100);
  await f.call("POST", target, { body: "New" }, 403, f.memberToken);
  await f.call(
    "PATCH",
    `${target}/${created.id}`,
    { body: "Still editable" },
    200,
    f.memberToken,
  );
  await f.call(
    "PATCH",
    `${target}/${created.id}`,
    { body: "x".repeat(101) },
    400,
    f.memberToken,
  );
  assert.deepEqual((await f.call("GET", url)).data.values, values);
  const audit = await f
    .db("asmblyr_security_events")
    .where({ action: "settings.plugin.update", actor_id: f.admin.id })
    .first();
  assert.ok(audit);
  assert.deepEqual(audit.details, {
    namespace: "comments",
    fields: ["allowNewComments", "maxLength"],
  });
});
