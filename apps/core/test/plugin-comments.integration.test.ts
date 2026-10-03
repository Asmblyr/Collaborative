import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { useAsmblyr } from "@asmblyr/kit";
import { loadPlugins } from "../src/plugins/load.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("comments follow record access, record real authors, isolate records and allow only author edits", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
    {
      sourcePlugins: true,
    },
  );
  const plugin = plugins.find((entry) => entry.namespace === "comments")!;
  assert.ok(plugin);
  const fixture = await pluginItemsFixture({
    plugins: [
      {
        ...plugin,
        endpoints: [
          ...plugin.endpoints,
          {
            method: "GET",
            path: "/comments/scope-check",
            handler: (event) =>
              useAsmblyr(event).storage!.list("asmblyr_users"),
          },
        ],
      },
    ],
  });
  t.after(fixture.close);
  const {
    call,
    app,
    db,
    collection,
    memberToken,
    outsiderToken,
    adminToken,
    member,
    outsider,
    grant,
    policyId,
  } = fixture;
  await db("asmblyr_users")
    .where({ id: member.id })
    .update({ display_name: "Автор теста" });
  const url = `/comments/${collection}/1`;
  await call("GET", url, undefined, 401, null);
  await call("GET", url, undefined, 403, outsiderToken);
  await call("POST", url, { body: "Forbidden" }, 403, outsiderToken);
  await call("GET", `/comments/${collection}/999`, undefined, 404, memberToken);
  await call("GET", "/comments/asmblyr_users/id", undefined, 400, adminToken);
  const created = (
    await call("POST", url, { body: " First comment " }, 201, memberToken)
  ).data;
  assert.equal(created.body, "First comment");
  assert.deepEqual(created.author, {
    id: member.id,
    kind: "user",
    name: "Автор теста",
  });
  assert.equal(created.canEdit, true);
  assert.equal(created.isOwn, true);
  assert.equal(
    (await call("GET", url, undefined, 200, memberToken)).data.length,
    1,
  );
  assert.equal(
    (
      await call(
        "GET",
        `/comments/${collection}/2`,
        undefined,
        200,
        memberToken,
      )
    ).data.length,
    0,
  );
  await call(
    "GET",
    "/items/plugin_comments_entries",
    undefined,
    403,
    memberToken,
  );
  await call("GET", "/comments/scope-check", undefined, 403, adminToken);
  for (const input of [
    { body: "" },
    { body: "x".repeat(10001) },
    { body: "forged", author_id: outsider.id },
    { body: 1 },
  ])
    await call("POST", url, input, 400, memberToken);
  const malformed = await app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${memberToken}`,
      "content-type": "application/json",
    },
    payload: "{",
  });
  assert.equal(malformed.statusCode, 400, malformed.body);
  await grant(collection, ["title"], outsider.id);
  const outsiderView = (await call("GET", url, undefined, 200, outsiderToken))
    .data[0];
  assert.equal(outsiderView.canEdit, false);
  assert.equal(outsiderView.isOwn, false);
  await call(
    "PATCH",
    `${url}/${created.id}`,
    { body: "hijack" },
    403,
    outsiderToken,
  );
  await call("DELETE", `${url}/${created.id}`, undefined, 403, outsiderToken);
  await call(
    "PATCH",
    `/comments/${collection}/2/${created.id}`,
    { body: "moved" },
    404,
    memberToken,
  );
  const updated = (
    await call(
      "PATCH",
      `${url}/${created.id}`,
      { body: "Edited" },
      200,
      memberToken,
    )
  ).data;
  assert.equal(updated.body, "Edited");
  assert.equal(updated.author.id, member.id);
  const events = await db("asmblyr_item_events").where({
    collection_name: "plugin_comments_entries",
    item_id: created.id,
  });
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.actor_id === member.id));
  await call(
    "DELETE",
    `/policies/${policyId}/users/${member.id}`,
    undefined,
    204,
  );
  await call("GET", url, undefined, 403, memberToken);
  await call(
    "PATCH",
    `${url}/${created.id}`,
    { body: "revoked" },
    403,
    memberToken,
  );
  await call("PUT", `/policies/${policyId}/users/${member.id}`, undefined, 204);
  await call("DELETE", `${url}/${created.id}`, undefined, 204, memberToken);
  assert.equal(
    (await call("GET", url, undefined, 200, memberToken)).page.total,
    "0",
  );
  assert.equal(
    (await call("GET", "/extensions", undefined, 200, memberToken)).data[0]
      .name,
    plugin.name,
  );
});
