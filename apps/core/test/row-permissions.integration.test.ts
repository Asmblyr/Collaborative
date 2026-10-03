import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { loadAccess } from "../src/permissions/access.js";
import { createItemsService } from "../src/plugins/items.js";
import { executeDataTool } from "../src/tools/data-tools.js";
import { executeAggregateTool } from "../src/tools/aggregate-tool.js";
import { requireFileRead } from "../src/files/references.js";

const own = {
  logic: "and",
  children: [
    { field: "owner", op: "eq", value: { kind: "context", path: "user.id" } },
  ],
};

test("row conditions preserve field branches, SQL counts, atomic writes and shared HTTP/Kit/MCP access", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const name = `test_rows_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const [admin, member, other] = await db("asmblyr_users")
    .insert([
      { email: `${randomUUID()}@example.test`, superuser: true },
      { email: `${randomUUID()}@example.test` },
      { email: `${randomUUID()}@example.test` },
    ])
    .returning("id");
  const adminHeaders = {
    authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}`,
  };
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, member.id)).accessToken}`,
  };
  const policies: string[] = [];
  let serviceId = "";
  t.after(async () => {
    await app.close();
    if (serviceId)
      await db("asmblyr_service_accounts").where({ id: serviceId }).delete();
    await db("asmblyr_policies").whereIn("id", policies).delete();
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db("asmblyr_files").where({ uploaded_by: admin.id }).delete();
    await db("asmblyr_users")
      .whereIn("id", [admin.id, member.id, other.id])
      .delete();
    await db.destroy();
  });
  async function call(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
    expected = 200,
    privileged = false,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: privileged ? adminHeaders : headers,
    });
    assert.equal(
      response.statusCode,
      expected,
      `${method} ${url}: ${response.body}`,
    );
    return response.statusCode === 204 ? null : response.json().data;
  }
  await call(
    "POST",
    "/collections",
    {
      name,
      fields: [
        { name: "title", type: "text" },
        { name: "secret", type: "text" },
        { name: "owner", type: "uuid" },
        { name: "status", type: "text" },
        { name: "amount", type: "decimal" },
        { name: "file", type: "file", nullable: true },
      ],
    },
    201,
    true,
  );
  await db("asmblyr_collections")
    .where({ name })
    .update({ display_field: "secret" });
  const collection = await db("asmblyr_collections")
    .where({ name })
    .first("id");
  const [a, b] = await db(name)
    .insert([
      {
        title: "mine",
        secret: "my-secret",
        owner: member.id,
        status: "published",
        amount: "10",
      },
      {
        title: "theirs",
        secret: "hidden-secret",
        owner: other.id,
        status: "draft",
        amount: "90",
      },
    ])
    .returning("id");
  async function policy(permissions: object[]) {
    const created = await call(
      "POST",
      "/policies",
      { name: `Rows ${randomUUID()}`, permissions, userIds: [member.id] },
      201,
      true,
    );
    policies.push(created.id);
    return created.id as string;
  }
  const conditional = await policy(
    ["read", "create", "update", "delete"].map((action) => ({
      collection: name,
      action,
      fields: ["*"],
      rowFilter: own,
    })),
  );
  const rows = await app.inject({
    method: "GET",
    url: `/items/${name}?limit=1`,
    headers,
  });
  assert.equal(rows.statusCode, 200, rows.body);
  assert.equal(rows.json().page.total, "1");
  assert.equal(rows.json().data[0].id, a.id);
  await call("GET", `/items/${name}/${b.id}`, undefined, 404);
  await call("PATCH", `/items/${name}/${b.id}`, { title: "stolen" }, 403);
  await call("PATCH", `/items/${name}/${a.id}`, { owner: other.id }, 403);
  assert.equal((await db(name).where({ id: a.id }).first()).owner, member.id);
  await call(
    "PATCH",
    `/items/${name}`,
    { ids: [a.id, b.id], values: { status: "changed" } },
    403,
  );
  assert.equal(
    (await db(name).where({ id: a.id }).first()).status,
    "published",
  );
  await call(
    "POST",
    `/items/${name}/commit`,
    {
      values: { title: "first", owner: member.id },
      records: [
        { collection: name, record: { id: a.id, values: { owner: other.id } } },
      ],
    },
    403,
  );
  assert.equal(Number((await db(name).count("* as n").first())!.n), 2);
  await call(
    "POST",
    `/items/${name}`,
    { title: "invalid", owner: other.id },
    403,
  );
  const created = await call(
    "POST",
    `/items/${name}`,
    { title: "new", owner: member.id },
    201,
  );
  await call("DELETE", `/items/${name}/${b.id}`, undefined, 403);
  await call("DELETE", `/items/${name}/${created.id}`, undefined, 204);
  assert.deepEqual(await call("GET", `/item-events/${name}`), []);

  // Related rows and candidates must use the same SQL scope before pagination.
  await call(
    "POST",
    `/collections/${name}/relations`,
    { name: "parent", targetCollection: name, reverseField: "children" },
    201,
    true,
  );
  await db(name).where({ id: b.id }).update({ parent: a.id });
  const child = await call(
    "POST",
    `/items/${name}`,
    { title: "child", owner: member.id, parent: a.id },
    201,
  );
  const relationList = await app.inject({
    method: "GET",
    url: `/items/${name}/${a.id}/relations/children?limit=1`,
    headers,
  });
  assert.equal(relationList.statusCode, 200, relationList.body);
  assert.equal(relationList.json().page.total, "1");
  assert.equal(relationList.json().data[0].id, child.id);
  await call(
    "GET",
    `/items/${name}/${b.id}/relations/children`,
    undefined,
    404,
  );
  await call(
    "POST",
    `/items/${name}`,
    { title: "bad link", owner: member.id, parent: b.id },
    404,
  );
  const relationFilter = encodeURIComponent(
    JSON.stringify({
      logic: "and",
      children: [{ field: "parent.title", op: "eq", value: "theirs" }],
    }),
  );
  await call("GET", `/items/${name}?filter=${relationFilter}`, undefined, 403);
  await call("DELETE", `/items/${name}/${child.id}`, undefined, 204);
  serviceId = (
    await call("POST", "/service-accounts", { name: "Rows worker" }, 201, true)
  ).id;
  await db("asmblyr_service_policies").insert({
    service_id: serviceId,
    policy_id: conditional,
  });
  const key = await call(
    "POST",
    `/service-accounts/${serviceId}/keys`,
    { name: "Rows test" },
    201,
    true,
  );
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/service-token",
    payload: { key: key.secret },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const serviceHeaders = {
    authorization: `Bearer ${exchange.json().accessToken}`,
  };
  const serviceRows = await app.inject({
    method: "GET",
    url: `/items/${name}`,
    headers: serviceHeaders,
  });
  assert.equal(serviceRows.statusCode, 200, serviceRows.body);
  assert.deepEqual(serviceRows.json().data, []);

  // Another grant's fields must not escape the condition of this branch.
  await policy([{ collection: name, action: "read", fields: ["title"] }]);
  const all = await call("GET", `/items/${name}`);
  assert.equal(all.length, 2);
  assert.equal(
    all.find((row: { id: string }) => row.id === a.id).secret,
    "my-secret",
  );
  assert.deepEqual(
    all.find((row: { id: string }) => row.id === b.id),
    { id: b.id, title: "theirs" },
  );
  const direct = await call("GET", `/items/${name}/${b.id}`);
  assert.deepEqual(direct, { id: b.id, title: "theirs" });
  const query = encodeURIComponent(
    JSON.stringify({
      logic: "and",
      children: [{ field: "secret", op: "eq", value: "hidden-secret" }],
    }),
  );
  assert.deepEqual(await call("GET", `/items/${name}?filter=${query}`), []);
  assert.deepEqual(await call("GET", `/items/${name}?q=hidden-secret`), []);
  const sorted = await app.inject({
    method: "GET",
    url: `/items/${name}?sort=secret`,
    headers,
  });
  assert.equal(sorted.json().page.total, "1");
  const searchResponse = await app.inject({
    method: "GET",
    url: "/search?q=hidden-secret",
    headers,
  });
  assert.equal(searchResponse.statusCode, 200);
  const search = searchResponse.json();
  assert.equal(
    search.items.some(
      (item: { collection: string }) => item.collection === name,
    ),
    false,
  );
  const labels = await app.inject({
    method: "GET",
    url: `/items/${name}`,
    headers,
  });
  assert.equal(labels.json().labels[b.id], b.id);
  const access = await loadAccess(db, headers.authorization);
  const kit = createItemsService(db, access);
  assert.deepEqual((await kit.get(name, b.id)).data, {
    id: b.id,
    title: "theirs",
  });
  await assert.rejects(kit.update(name, b.id, { title: "bad" }), {
    statusCode: 403,
  });
  const tool = (await executeDataTool(
    db,
    access,
    name,
    collection.id,
    "read_item",
    { id: b.id, fields: ["title", "secret"] },
  )) as { item: { values: object } };
  assert.deepEqual(tool.item.values, { id: b.id, title: "theirs" });
  const aggregate = (await executeAggregateTool(
    db,
    access,
    name,
    collection.id,
    {
      q: "",
      filter: "",
      terms: null,
      groupBy: [],
      metrics: [{ operation: "sum", field: "amount" }],
      orderBy: null,
      page: 1,
      limit: 20,
    },
  )) as { groups: { metrics: string[]; count: string }[] };
  assert.equal(aggregate.groups[0].count, "1");
  assert.equal(Number(aggregate.groups[0].metrics[0]), 10);

  // File-reference metadata cannot turn an unreadable row/field into file access.
  const fakeFile = randomUUID();
  await db("asmblyr_files").insert({
    id: fakeFile,
    storage: "test",
    object_key: fakeFile,
    filename: "private.txt",
    title: "Private",
    mime_type: "text/plain",
    size: 0,
    sha256: "0".repeat(64),
    status: "ready",
    uploaded_by: admin.id,
  });
  await db(name).where({ id: b.id }).update({ file: fakeFile });
  await db("asmblyr_file_references").insert({
    collection_id: collection.id,
    item_id: b.id,
    field_name: "file",
    file_id: fakeFile,
  });
  await assert.rejects(requireFileRead(db, fakeFile, access), {
    statusCode: 404,
  });
  await db(name).where({ id: a.id }).update({ file: fakeFile });
  await db("asmblyr_file_references").insert({
    collection_id: collection.id,
    item_id: a.id,
    field_name: "file",
    file_id: fakeFile,
  });
  await requireFileRead(db, fakeFile, access);

  // Shared grant copy-on-write includes its condition in the identity.
  const detail = await call(
    "GET",
    `/policies/${conditional}`,
    undefined,
    200,
    true,
  );
  const clone = await policy(
    detail.permissions.map(
      ({ collection, action, fields, rowFilter }: Record<string, unknown>) => ({
        collection,
        action,
        fields,
        rowFilter,
      }),
    ),
  );
  const cloneDetail = await call(
    "GET",
    `/policies/${clone}`,
    undefined,
    200,
    true,
  );
  assert.equal(cloneDetail.permissions[0].id, detail.permissions[0].id);
  await call(
    "PATCH",
    `/policies/${clone}`,
    {
      name: "Changed",
      permissions: [
        {
          collection: name,
          action: "read",
          fields: ["*"],
          rowFilter: {
            logic: "or",
            children: [
              own,
              {
                field: "status",
                op: "eq",
                value: { kind: "literal", value: "draft" },
              },
            ],
          },
        },
      ],
      userIds: [],
    },
    200,
    true,
  );
  assert.deepEqual(
    (await call("GET", `/policies/${conditional}`, undefined, 200, true))
      .permissions,
    detail.permissions,
  );

  for (const rowFilter of [
    { logic: "and", children: [] },
    {
      logic: "and",
      children: [
        {
          field: "owner",
          op: "eq",
          value: { kind: "context", path: "user.department" },
        },
      ],
    },
    {
      logic: "and",
      children: [
        {
          field: "amount",
          op: "eq",
          value: { kind: "context", path: "user.id" },
        },
      ],
    },
    {
      logic: "and",
      children: [
        {
          field: "owner.id",
          op: "eq",
          value: { kind: "literal", value: member.id },
        },
      ],
    },
  ])
    await call(
      "POST",
      "/permissions",
      { collection: name, action: "read", fields: ["*"], rowFilter },
      400,
      true,
    );
  // A missing context invalidates the whole branch, even inside OR.
  await db("asmblyr_permissions")
    .where({
      id: detail.permissions.find(
        (entry: { action: string }) => entry.action === "read",
      ).id,
    })
    .update({
      row_filter: {
        logic: "or",
        children: [
          {
            field: "owner",
            op: "eq",
            value: { kind: "context", path: "service.id" },
          },
          {
            field: "status",
            op: "eq",
            value: { kind: "literal", value: "draft" },
          },
        ],
      },
    });
  assert.deepEqual(await call("GET", `/items/${name}/${b.id}`), {
    id: b.id,
    title: "theirs",
  });
});
