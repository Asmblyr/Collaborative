import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { featureFixture } from "./support/feature-fixture.js";

test("sensitive history is scrubbed at rest, including old events, while field grants still control live data", async (t) => {
  const f = await featureFixture();
  t.after(f.close);
  const name = `${f.prefix}_secrets`;
  f.names.push(name);
  await f.call(
    "POST",
    "/collections",
    {
      name,
      fields: [
        { name: "title", type: "text" },
        { name: "credential", type: "text" },
      ],
    },
    201,
  );
  const row = await f.call(
    "POST",
    `/items/${name}`,
    { title: "ordinary", credential: "old-secret" },
    201,
  );
  await f.call("PATCH", `/items/${name}/${row.id}`, {
    credential: "current-secret",
  });
  await f.call("PUT", `/collections/${name}/fields/credential/presentation`, {
    sensitive: true,
  });
  const events = () =>
    f
      .db("asmblyr_item_events")
      .where({ collection_name: name })
      .select("before", "after");
  let json = JSON.stringify(await events());
  assert.ok(!json.includes("old-secret") && !json.includes("current-secret"));
  assert.ok(json.includes("[REDACTED]") && json.includes("ordinary"));
  assert.equal(
    (await f.call("GET", `/items/${name}/${row.id}`)).credential,
    "current-secret",
  );
  await f.call("PATCH", `/items/${name}/${row.id}`, {
    credential: "next-secret",
  });
  const second = await f.call(
    "POST",
    `/items/${name}`,
    { title: "second", credential: "new-secret" },
    201,
  );
  await f.call("PATCH", `/items/${name}`, {
    ids: [row.id, second.id],
    values: { credential: "bulk-secret" },
  });
  await f.call("POST", `/items/${name}/commit`, {
    id: second.id,
    values: { credential: "nested-secret" },
  });
  await f.call("DELETE", `/items/${name}/${second.id}`, undefined, 204);
  json = JSON.stringify(await events());
  for (const value of [
    "old-secret",
    "current-secret",
    "next-secret",
    "new-secret",
    "bulk-secret",
    "nested-secret",
  ]) {
    assert.ok(!json.includes(value), `persisted secret: ${value}`);
  }
  await f.grant(name, "read", ["title"]);
  assert.equal(
    (
      await f.call(
        "GET",
        `/items/${name}/${row.id}`,
        undefined,
        200,
        f.memberHeaders,
      )
    ).credential,
    undefined,
  );
  const history = await f.app.inject({
    method: "GET",
    url: `/item-events/${name}`,
    headers: f.memberHeaders,
  });
  assert.equal(history.statusCode, 200);
  assert.ok(
    !history.body.includes("credential") &&
      !history.body.includes("bulk-secret"),
  );
  await f.call(
    "PATCH",
    `/collections/${name}/fields/credential`,
    { defaultValue: "default-secret" },
    400,
  );
  await f.call(
    "PUT",
    `/collections/${name}/display`,
    { displayField: "title", displayTemplate: "{{credential}}" },
    400,
  );
  await f.call("PUT", `/collections/${name}/fields/credential/presentation`, {
    sensitive: false,
  });
  assert.ok(
    !JSON.stringify(await events()).includes("bulk-secret"),
    "disabling cannot restore old history",
  );
  await t.test(
    "concurrent configuration cannot copy a newly sensitive source into an ordinary field",
    async () => {
      const source = `${f.prefix}_source`,
        derived = `${f.prefix}_derived`;
      f.names.push(derived, source);
      await f.call(
        "POST",
        "/collections",
        { name: source, fields: [{ name: "value", type: "text" }] },
        201,
      );
      await f.call(
        "POST",
        "/collections",
        { name: derived, fields: [{ name: "copy", type: "text" }] },
        201,
      );
      await f.call(
        "POST",
        `/collections/${derived}/relations`,
        { name: "parent", targetCollection: source },
        201,
      );
      const responses = await Promise.all([
        f.app.inject({
          method: "PUT",
          url: `/collections/${source}/fields/value/presentation`,
          headers: f.adminHeaders,
          payload: { sensitive: true },
        }),
        f.app.inject({
          method: "PUT",
          url: `/collections/${derived}/fields/copy/presentation`,
          headers: f.adminHeaders,
          payload: {
            rules: { computed: { relation: "parent", field: "value" } },
          },
        }),
      ]);
      assert.deepEqual(
        responses.map((response) => response.statusCode).sort(),
        [200, 400],
      );
    },
  );
});

test("public file sharing is explicit, manager-only, content-only and revocable", async (t) => {
  const f = await featureFixture();
  t.after(f.close);
  const upload = await f.app.inject({
    method: "POST",
    url: "/files",
    headers: {
      ...f.adminHeaders,
      "content-type": "application/octet-stream",
      "x-file-name": "example.txt",
    },
    payload: Buffer.from("public example"),
  });
  assert.equal(upload.statusCode, 201, upload.body);
  const file = upload.json().data;
  assert.equal(file.visibility, "private");
  const content = (id = file.id) =>
    f.app.inject({ method: "GET", url: `/public/files/${id}/content` });
  assert.equal((await content()).statusCode, 404);
  await f.call(
    "PATCH",
    `/files/${file.id}`,
    { visibility: "public" },
    403,
    f.memberHeaders,
  );
  await f.call("PATCH", `/files/${file.id}`, { visibility: "other" }, 400);
  await f.call("PATCH", `/files/${file.id}`, { visibility: "public" });
  const migration = createRequire(import.meta.url)(
    "../migrations/20261004090000_public_files.cjs",
  ) as { down(database: typeof f.db): Promise<void> };
  await assert.rejects(migration.down(f.db), /Make published files private/);
  assert.equal(
    (await f.db("asmblyr_files").where({ id: file.id }).first("visibility"))
      .visibility,
    "public",
  );
  const bytes = await content();
  assert.equal(bytes.statusCode, 200);
  assert.equal(bytes.body, "public example");
  assert.equal(bytes.headers["cache-control"], "no-store");
  assert.equal(bytes.headers["x-content-type-options"], "nosniff");
  assert.ok(
    String(bytes.headers["content-security-policy"]).includes("sandbox"),
  );
  assert.ok(
    String(bytes.headers["content-disposition"]).startsWith("attachment"),
  );
  for (const url of [
    "/files",
    `/files/${file.id}`,
    `/files/${file.id}/events`,
    `/files/${file.id}/content`,
  ]) {
    const response = await f.app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, `${url}: ${response.body}`);
  }
  assert.equal((await content(randomUUID())).statusCode, 404);
  await f
    .db("asmblyr_files")
    .where({ id: file.id })
    .update({ status: "failed" });
  assert.equal((await content()).statusCode, 404);
  await f
    .db("asmblyr_files")
    .where({ id: file.id })
    .update({ status: "ready" });
  await f.call("PATCH", `/files/${file.id}`, { visibility: "private" });
  assert.equal((await content()).statusCode, 404);
  await f.call("PATCH", `/files/${file.id}`, { visibility: "public" });
  await f.call("DELETE", `/files/${file.id}`, undefined, 204);
  assert.equal((await content()).statusCode, 404);
});
