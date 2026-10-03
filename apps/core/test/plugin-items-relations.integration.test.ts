import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("kit relation filters, search and labels honor source and target grants", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const {
    app,
    db,
    call,
    collection,
    memberToken,
    adminToken,
    grant,
    permissionId,
  } = fixture;
  const authors = `${collection}_authors`;
  await call(
    "POST",
    "/collections",
    {
      name: authors,
      primaryKey: { name: "id", type: "serial" },
      fields: [
        { name: "name", type: "text" },
        { name: "secret", type: "text" },
      ],
    },
    201,
  );
  await call(
    "POST",
    `/collections/${collection}/relations`,
    {
      name: "author_id",
      targetCollection: authors,
      reverseField: "posts",
    },
    201,
  );
  await call(
    "POST",
    `/items/${authors}`,
    { name: "Ada", secret: "hidden-author" },
    201,
  );
  await db(collection).where({ id: 1 }).update({ author_id: 1 });
  const search = await app.inject({
    method: "PUT",
    url: `/collections/${collection}/relations/author_id/search`,
    payload: { searchable: true },
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(search.statusCode, 200, search.body);
  const filter = {
    logic: "and",
    children: [{ field: "author_id.name", op: "eq", value: "Ada" }],
  };
  const read = (options: object, status = 200) =>
    call("POST", "/reader/list", { collection, options }, status, memberToken);

  await read({ filter }, 403);
  // Source FK alone does not grant access to the target's records or fields.
  await call("PATCH", `/permissions/${permissionId}`, {
    fields: ["title", "author_id"],
  });
  await read({ filter }, 403);
  assert.equal((await read({ q: "Ada" })).page.total, "0");
  await grant(authors, ["name", "posts"]);
  const result = await read({ fields: ["id"], filter });
  assert.deepEqual(result.data, [{ id: 1 }]);
  assert.deepEqual(
    result,
    await call(
      "GET",
      `/items/${collection}?fields=id&filter=${encodeURIComponent(JSON.stringify(filter))}`,
      undefined,
      200,
      memberToken,
    ),
  );
  assert.deepEqual((await read({ q: "Ada", fields: ["id"] })).data, [
    { id: 1 },
  ]);
  assert.equal((await read({ q: "hidden-author" })).page.total, "0");
  await read(
    {
      filter: {
        logic: "and",
        children: [
          { field: "author_id.secret", op: "eq", value: "hidden-author" },
        ],
      },
    },
    403,
  );
  await read({ fields: ["author_id.name"] }, 400);

  // Labels may read other permitted fields, but never a private target display field.
  await call("PUT", `/collections/${collection}/display`, {
    displayField: null,
  });
  await db(collection).where({ id: 1 }).update({ title: null });
  await call("PUT", `/collections/${authors}/display`, {
    displayField: "name",
  });
  assert.equal((await read({ fields: ["id"], filter })).labels["1"], "Ada");
  await call("PUT", `/collections/${authors}/display`, {
    displayField: "secret",
  });
  assert.doesNotMatch(
    JSON.stringify(await read({ fields: ["id"] })),
    /hidden-author/,
  );
  await db(collection).where({ id: 1 }).update({ title: "Bravo" });

  // Reverse filters also require permission to the target's foreign key.
  const reverse = {
    logic: "and",
    children: [
      { field: "posts.title", op: "eq", value: "Bravo", quantifier: "some" },
    ],
  };
  const reverseResult = await call(
    "POST",
    "/reader/list",
    { collection: authors, options: { filter: reverse } },
    200,
    memberToken,
  );
  assert.equal(reverseResult.page.total, "1");
  await call("PATCH", `/permissions/${permissionId}`, {
    fields: ["title"],
  });
  await call(
    "POST",
    "/reader/list",
    { collection: authors, options: { filter: reverse } },
    403,
    memberToken,
  );
  await read({ filter }, 403);
});
