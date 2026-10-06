import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("relevance ranks literal matches before pagination and excludes unreadable or sensitive fields", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, db);
  const name = `test_relevance_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const cleanup: { readerId?: string; policyId?: string } = {};
  t.after(async () => {
    await app.close();
    if (cleanup.policyId) {
      await db("asmblyr_policies").where({ id: cleanup.policyId }).delete();
    }
    await db.schema.dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    if (cleanup.readerId) {
      await db("asmblyr_users").where({ id: cleanup.readerId }).delete();
    }
    await db.destroy();
  });
  const call = async (
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: object,
    headers?: Record<string, string>,
    expected = 200,
  ) => {
    const response = await app.inject({ method, url, payload, headers });
    assert.equal(response.statusCode, expected, response.body);
    return response.json();
  };
  await call(
    "POST",
    "/collections",
    {
      name,
      primaryKey: { name: "id", type: "serial" },
      fields: ["title", "helper", "secret"].map((field) => ({
        name: field,
        type: "text",
      })),
    },
    undefined,
    201,
  );
  const ids: string[] = [];
  for (const [title, helper, secret] of [
    ["подкормка", "", "корм"],
    ["сухой корм", "", ""],
    ["корм для кошек", "", ""],
    ["КОРМ", "", ""],
    ["кормовой", "", ""],
    ["другое", "корм", ""],
    ["  корм  ", "", ""],
    ["корм", "", ""],
  ]) {
    ids.push(
      String(
        (
          await call(
            "POST",
            `/items/${name}`,
            { title, helper, secret },
            undefined,
            201,
          )
        ).data.id,
      ),
    );
  }
  const [reader] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test` })
    .returning<{ id: string }[]>("id");
  cleanup.readerId = reader.id;
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, reader.id)).accessToken}`,
  };
  cleanup.policyId = (
    await call(
      "POST",
      "/policies",
      {
        name: `Relevance ${name}`,
        userIds: [reader.id],
        permissions: [
          { collection: name, action: "read", fields: ["title", "helper"] },
          {
            collection: name,
            action: "read",
            fields: ["secret"],
            rowFilter: {
              logic: "and",
              children: [
                {
                  field: "id",
                  op: "eq",
                  value: { kind: "literal", value: ids[5] },
                },
              ],
            },
          },
        ],
      },
      undefined,
      201,
    )
  ).data.id;
  const url = `/items/${name}?q=${encodeURIComponent("корм")}`;
  const ordered = (body: { data: { id: unknown }[] }) =>
    body.data.map((row) => String(row.id));
  const expected = [
    ids[3],
    ids[6],
    ids[7],
    ids[5],
    ids[2],
    ids[1],
    ids[0],
    ids[4],
  ];
  const result = await call("GET", url, undefined, headers);
  assert.equal(result.page.order, "relevance");
  assert.equal(result.page.total, "8");
  assert.deepEqual(
    ordered(result),
    expected,
    "a hidden exact match cannot move a substring hit above visible titles",
  );
  assert.deepEqual(
    ordered(
      await call(
        "GET",
        `/items/${name}?q=${encodeURIComponent("КоРм")}`,
        undefined,
        headers,
      ),
    ),
    expected,
  );
  const pages: string[] = [];
  for (let page = 1; page <= 4; page++) {
    const response = await call(
      "GET",
      `${url}&limit=2&page=${page}`,
      undefined,
      headers,
    );
    assert.equal(response.page.total, "8");
    pages.push(...ordered(response));
  }
  assert.deepEqual(pages, expected);
  const manual = await call(
    "GET",
    `${url}&sort=id&direction=desc`,
    undefined,
    headers,
  );
  assert.equal(manual.page.order, "field");
  assert.deepEqual(ordered(manual), [...ids].reverse());
  const ties = await call(
    "GET",
    `${url}&sort=id&direction=desc&order=relevance`,
    undefined,
    headers,
  );
  assert.deepEqual(ordered(ties).slice(0, 3), [ids[7], ids[6], ids[3]]);
  assert.equal(
    (await call("GET", `/items/${name}?order=relevance`, undefined, headers))
      .page.order,
    "field",
  );
  await call("GET", `${url}&order=unknown`, undefined, headers, 400);

  const configuration = `/collections/${name}/fields/helper/configuration`;
  await call("PUT", configuration, { searchPriority: "primary" });
  await call("PUT", `/collections/${name}/fields/title/configuration`, {
    searchPriority: "secondary",
  });
  assert.equal(ordered(await call("GET", url, undefined, headers))[0], ids[5]);
  await call("PUT", `/collections/${name}/fields/helper/search`, {
    searchable: true,
    indexed: false,
  });
  const catalog = await call("GET", "/collections");
  assert.equal(
    catalog.data
      .find((c: { name: string }) => c.name === name)
      .fields.find((f: { name: string }) => f.name === "helper").searchPriority,
    "primary",
  );
  await call(
    "PUT",
    configuration,
    { searchPriority: "invalid" },
    undefined,
    400,
  );
  await call("PUT", configuration, { searchPriority: null });
  await call("PUT", `/collections/${name}/fields/title/configuration`, {
    searchPriority: null,
  });
  assert.deepEqual(
    ordered(await call("GET", url, undefined, headers)),
    expected,
  );
  await call("PUT", `/collections/${name}/fields/secret/configuration`, {
    presentation: { sensitive: true },
    searchPriority: "primary",
  });
  assert.deepEqual(
    ordered(await call("GET", url)),
    expected,
    "sensitive fields do not affect ranking even for the administrator",
  );

  for (const literal of [
    "%",
    "_",
    "\\",
    "[x]",
    "(x)",
    "a.b",
    "a+b",
    "x{2}",
    "x|y",
    "x$",
  ]) {
    const inserted = await call(
      "POST",
      `/items/${name}`,
      { title: literal, helper: "", secret: "" },
      undefined,
      201,
    );
    const found = await call(
      "GET",
      `/items/${name}?q=${encodeURIComponent(literal)}`,
      undefined,
      headers,
    );
    assert.deepEqual(
      ordered(found),
      [String(inserted.data.id)],
      `literal ${literal}`,
    );
  }
});
