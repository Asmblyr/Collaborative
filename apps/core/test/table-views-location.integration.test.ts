import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("explicit workspace view context is per request, preserves personal selection and never grants collection access", async (t) => {
  const f = await featureFixture();
  t.after(f.close);
  const name = `${f.prefix}_location`;
  const hidden = `${f.prefix}_hidden`;
  f.names.push(name, hidden);
  for (const collection of f.names) {
    await f.call(
      "POST",
      "/collections",
      { name: collection, fields: [{ name: "title", type: "text" }] },
      201,
    );
  }
  await f.grant(name, "read", ["title"]);
  const definition = {
    columns: { order: ["title", "id"], hidden: [] },
    pageSize: 25,
    sort: { field: "title", direction: "asc" },
    filter: null,
    q: "",
  };
  const workspaces = [];
  for (const suffix of ["one", "two"]) {
    const workspace = await f.call(
      "POST",
      "/workspaces",
      { name: `${f.prefix}_${suffix}`, collections: [name, hidden] },
      201,
    );
    const view = await f.call(
      "POST",
      `/table-views/${name}`,
      {
        name: suffix,
        scope: "workspace",
        workspaceId: workspace.id,
        isDefault: true,
        definition,
      },
      201,
    );
    workspaces.push({ workspace, view });
  }
  const [one, two] = workspaces;
  await f.call(
    "PUT",
    "/users/me/workspace",
    { workspaceId: one.workspace.id },
    200,
    f.memberHeaders,
  );
  const get = (path: string, status = 200) =>
    f.call("GET", path, undefined, status, f.memberHeaders);
  const endpoint = `/table-views/${name}`;
  assert.equal((await get(`${endpoint}/default`)).id, one.view.id);
  for (const { workspace, view } of [two, one, two]) {
    assert.equal(
      (await get(`${endpoint}/default?workspaceId=${workspace.id}`)).id,
      view.id,
    );
    assert.deepEqual(
      (await get(`${endpoint}?workspaceId=${workspace.id}`)).map(
        (row: { id: string }) => row.id,
      ),
      [view.id],
    );
  }
  assert.equal((await get("/workspaces")).selectedId, one.workspace.id);
  assert.equal(await get(`${endpoint}/default?workspaceId=all`), null);
  assert.deepEqual(await get(`${endpoint}?workspaceId=all`), []);
  await get(`${endpoint}?workspaceId=invalid`, 400);
  await get(
    `${endpoint}?workspaceId=${one.workspace.id}&workspaceId=${two.workspace.id}`,
    400,
  );
  await get(`/table-views/${hidden}?workspaceId=${one.workspace.id}`, 403);
  await get(`/items/${hidden}`, 403);
  await f.call("DELETE", `/workspaces/${two.workspace.id}`, undefined, 204);
  assert.deepEqual(
    await get(`${endpoint}?workspaceId=${two.workspace.id}`),
    [],
  );
  assert.equal((await get(`${endpoint}/default`)).id, one.view.id);
});
