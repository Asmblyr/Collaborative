import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("kit reads match /items, project in SQL and keep the caller's field permissions", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const { app, call, collection, memberToken, outsiderToken, adminToken, db, member, policyId } =
    fixture;
  const list = (options?: object, status = 200, token = memberToken) =>
    call("POST", "/reader/list", { collection, options }, status, token);
  const get = (id: string | number, options?: object, status = 200, token = memberToken) =>
    call("POST", "/reader/get", { collection, id, options }, status, token);

  const expected = await call("GET", `/items/${collection}`, undefined, 200, memberToken);
  const actual = await list();
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.data.map(Object.keys), Array(3).fill(["id", "title"]));
  assert.deepEqual(actual.labels, { "1": "1", "2": "2", "3": "3" });
  assert.equal(actual.page.total, "3");
  assert.equal(actual.page.size, 100);
  assert.deepEqual(
    await get(1),
    await call("GET", `/items/${collection}/1`, undefined, 200, memberToken),
  );

  const options = { fields: ["id"], sort: "title", direction: "asc", limit: 1, page: 2 };
  const projected = await list(options);
  assert.deepEqual(projected.data, [{ id: 1 }]);
  assert.deepEqual(
    projected,
    await call(
      "GET",
      `/items/${collection}?fields=id&sort=title&limit=1&page=2`,
      undefined,
      200,
      memberToken,
    ),
  );
  assert.deepEqual((await get(1, { fields: [] })).data, { id: 1 });
  assert.deepEqual((await get(1, { fields: ["title", "id", "title"] })).data, {
    id: 1,
    title: "Bravo",
  });
  assert.deepEqual(
    await get(1, { fields: ["title"] }),
    await call("GET", `/items/${collection}/1?fields=title`, undefined, 200, memberToken),
  );
  assert.deepEqual((await list({ fields: ["id"], q: "Alpha" })).data, [{ id: 2 }]);
  assert.equal((await list({ q: "classified" })).page.total, "0");
  assert.equal((await list({ page: 10 })).page.total, "3");
  await get(999, undefined, 404);
  await list(undefined, 403, outsiderToken);
  await get(1, undefined, 403, outsiderToken);
  await call("POST", "/reader/list", { collection }, 401, null);

  const filter = { logic: "and", children: [{ field: "title", op: "eq", value: "Bravo" }] };
  const filtered = await list({ fields: ["id"], filter });
  assert.deepEqual(filtered.data, [{ id: 1 }]);
  assert.deepEqual(
    filtered,
    await call(
      "GET",
      `/items/${collection}?fields=id&filter=${encodeURIComponent(JSON.stringify(filter))}`,
      undefined,
      200,
      memberToken,
    ),
  );
  for (const query of [
    { fields: ["secret"] },
    { sort: "secret" },
    {
      filter: { logic: "and", children: [{ field: "secret", op: "eq", value: "classified" }] },
    },
  ]) {
    await list(query, 403);
  }
  await get(1, { fields: ["secret"] }, 403);
  await call("GET", `/items/${collection}?fields=secret`, undefined, 403, memberToken);
  await call("GET", `/items/${collection}/1?fields=secret`, undefined, 403, memberToken);
  assert.equal(
    (await get(1, { fields: ["secret", "created_at"] }, 200, adminToken)).data.secret,
    "classified",
  );
  assert.equal((await list(undefined, 200, adminToken)).data[0].secret, "classified");

  // Concurrent requests never share the superuser's reader with another principal.
  const responses = await Promise.all(
    [adminToken, memberToken, outsiderToken].map((token) =>
      app.inject({
        method: "POST",
        url: "/reader/list",
        headers: { authorization: `Bearer ${token}` },
        payload: { collection },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.statusCode),
    [200, 200, 403],
  );
  assert.equal(responses[1].json().data[0].secret, undefined);

  await call("DELETE", `/policies/${policyId}/users/${member.id}`, undefined, 204);
  await list(undefined, 403);
  await call("PUT", `/policies/${policyId}/users/${member.id}`, undefined, 204);
  await list();
  await db("asmblyr_auth_sessions")
    .where({ user_id: member.id })
    .update({ revoked_at: db.fn.now() });
  await list(undefined, 401);
});

test("kit service reads use service policies and reject revoked credentials", async (t) => {
  const fixture = await pluginItemsFixture();
  t.after(fixture.close);
  const { call, collection, policyId } = fixture;
  const service = (await call("POST", "/service-accounts", { name: "SDK worker" }, 201)).data;
  const key = (
    await call("POST", `/service-accounts/${service.id}/keys`, { name: "SDK test" }, 201)
  ).data;
  const { accessToken } = await call("POST", "/auth/service-token", { key: key.secret }, 200, null);
  const read = (status: number) =>
    call("POST", "/reader/list", { collection }, status, accessToken);
  await read(403);
  await call("PUT", `/service-accounts/${service.id}`, {
    name: "SDK worker",
    policyIds: [policyId],
  });
  assert.deepEqual(
    await read(200),
    await call("GET", `/items/${collection}`, undefined, 200, accessToken),
  );
  assert.deepEqual(
    await call("POST", "/reader/get", { collection, id: 1 }, 200, accessToken),
    await call("GET", `/items/${collection}/1`, undefined, 200, accessToken),
  );
  await call("PUT", `/service-accounts/${service.id}`, { name: "SDK worker", policyIds: [] });
  await read(403);
  await call("DELETE", `/service-accounts/${service.id}/keys/${key.id}`, undefined, 204);
  await read(401);
});
