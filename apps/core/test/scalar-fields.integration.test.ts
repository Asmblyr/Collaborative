import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@asmblyr-collaborative/sdk";
import { featureFixture } from "./support/feature-fixture.js";

test("date, bigint and integer choices roundtrip through HTTP, SDK and permissions", async (t) => {
  const f = await featureFixture();
  t.after(f.close);
  const name = `${f.prefix}_scalars`;
  f.names.push(name);
  const { call } = f;
  await call(
    "POST",
    "/collections",
    {
      name,
      fields: [
        { name: "day", type: "date", defaultValue: "2026-10-04" },
        { name: "counter", type: "bigint", defaultValue: "9007199254740993" },
        { name: "kind", type: "integer", defaultValue: 0 },
        { name: "title", type: "text" },
      ],
    },
    201,
  );
  const options = [
    { value: 0, label: "Zero" },
    { value: -1, label: "Negative" },
    { value: 2, label: "Two" },
  ];
  await call("PUT", `/collections/${name}/fields/kind/presentation`, {
    interface: "select",
    options,
  });
  const url = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const sdk = createClient({
    baseUrl: url,
    accessToken: f.adminHeaders.authorization.slice(7),
  });
  const first = (await sdk.items.create(name, {})).data!;
  assert.equal(first.day, "2026-10-04");
  assert.equal(first.counter, "9007199254740993");
  assert.equal(first.kind, 0);
  const second = (
    await sdk.items.create(name, { day: "2026-10-03", counter: "10", kind: -1 })
  ).data!;

  await t.test(
    "native values sort and filter without lexical or timezone conversion",
    async () => {
      const sorted = await sdk.items.list(name, {
        sort: "counter",
        direction: "asc",
      });
      assert.deepEqual(
        sorted.data.map((row) => row.counter),
        ["10", "9007199254740993"],
      );
      const filtered = await sdk.items.list(name, {
        filter: {
          logic: "and",
          children: [
            {
              field: "day",
              op: "between",
              value: ["2026-10-04", "2026-10-05"],
            },
            { field: "counter", op: "gt", value: "9007199254740992" },
            { field: "kind", op: "eq", value: "0" },
          ],
        },
      });
      assert.equal(filtered.page.total, "1");
      assert.equal(filtered.data[0]!.id, first.id);
      await sdk.items.commit(name, {
        id: String(first.id),
        values: { day: "2024-02-29", counter: "9223372036854775807" },
        expectedValues: { day: "2026-10-04", counter: "9007199254740993" },
      });
      const saved = (await sdk.items.get(name, String(first.id))).data;
      assert.equal(saved.day, "2024-02-29");
      assert.equal(saved.counter, "9223372036854775807");
      await assert.rejects(
        sdk.items.commit(name, {
          id: String(first.id),
          values: { day: "2026-10-04" },
          expectedValues: { day: "2026-10-04" },
        }),
        { status: 409, code: "ITEM_CHANGED" },
      );
      await sdk.items.update(name, String(second.id), {
        day: null,
        counter: "-9223372036854775808",
      });
      assert.equal(
        (await sdk.items.get(name, String(second.id))).data.day,
        null,
      );
      assert.equal(
        (await sdk.items.get(name, String(second.id))).data.counter,
        "-9223372036854775808",
      );
    },
  );

  await t.test(
    "API rejects invalid dates, unsafe numeric bigints and unconfigured choices",
    async () => {
      for (const day of [
        "2026-02-29",
        "2026-04-31",
        "0000-01-01",
        "2026-10-04T00:00:00Z",
      ]) {
        await call("PATCH", `/items/${name}/${first.id}`, { day }, 400);
      }
      for (const counter of [
        9007199254740993,
        1,
        "9223372036854775808",
        "1.5",
        "01",
      ]) {
        await call("PATCH", `/items/${name}/${first.id}`, { counter }, 400);
      }
      for (const kind of ["0", 1, 0.5]) {
        await call("PATCH", `/items/${name}/${first.id}`, { kind }, 400);
      }
      for (const choices of [
        [{ value: "0", label: "String" }],
        [
          { value: 0, label: "A" },
          { value: -0, label: "B" },
        ],
        [{ value: 2147483648, label: "Overflow" }],
      ]) {
        await call(
          "PUT",
          `/collections/${name}/fields/kind/presentation`,
          { interface: "select", options: choices },
          400,
        );
      }
      await call(
        "PATCH",
        `/collections/${name}/fields/kind`,
        { defaultValue: 1 },
        400,
      );
      await call(
        "PATCH",
        `/collections/${name}/fields/day`,
        { defaultValue: "2026-02-29" },
        400,
      );
    },
  );

  await t.test(
    "removed choices remain readable; unrelated updates preserve them",
    async () => {
      await call("PUT", `/collections/${name}/fields/kind/presentation`, {
        interface: "select",
        options: options.filter((option) => option.value !== -1),
      });
      const row = await call("PATCH", `/items/${name}/${second.id}`, {
        title: "Legacy choice",
      });
      assert.equal(row.kind, -1);
      await call("PATCH", `/items/${name}/${second.id}`, { kind: -1 }, 400);
    },
  );

  await t.test(
    "date and bigint literals constrain rows; hidden fields cannot be sorted",
    async () => {
      const policy = await call(
        "POST",
        "/policies",
        {
          name: `${f.prefix}_scalars`,
          userIds: [f.member.id],
          permissions: [
            {
              collection: name,
              action: "read",
              fields: ["day", "kind"],
              rowFilter: {
                logic: "and",
                children: [
                  {
                    field: "day",
                    op: "eq",
                    value: { kind: "literal", value: "2024-02-29" },
                  },
                  {
                    field: "counter",
                    op: "gte",
                    value: { kind: "literal", value: "9007199254740993" },
                  },
                ],
              },
            },
          ],
        },
        201,
      );
      const rows = await call(
        "GET",
        `/items/${name}`,
        undefined,
        200,
        f.memberHeaders,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, first.id);
      assert.equal(rows[0].counter, undefined);
      await call(
        "GET",
        `/items/${name}?sort=counter`,
        undefined,
        403,
        f.memberHeaders,
      );
      await call("DELETE", `/policies/${policy.id}`, undefined, 204);
    },
  );

  await t.test(
    "varchar is writable text without changing its physical type",
    async () => {
      await f.db.raw("ALTER TABLE ?? ALTER COLUMN ?? TYPE varchar(32)", [
        name,
        "title",
      ]);
      const catalog = await call("GET", "/collections");
      assert.equal(
        catalog
          .find((collection: { name: string }) => collection.name === name)
          .fields.find((field: { name: string }) => field.name === "title")
          .type,
        "text",
      );
      const updated = await call("PATCH", `/items/${name}/${first.id}`, {
        title: "Сохранённый текст",
      });
      assert.equal(updated.title, "Сохранённый текст");
      await call(
        "PATCH",
        `/items/${name}/${first.id}`,
        { title: "x".repeat(33) },
        400,
      );
      const column = await f
        .db("information_schema.columns")
        .where({
          table_schema: "public",
          table_name: name,
          column_name: "title",
        })
        .first();
      assert.equal(column.data_type, "character varying");
      assert.equal(column.character_maximum_length, 32);
      await call(
        "PATCH",
        `/collections/${name}/fields/title`,
        { defaultValue: "x".repeat(33) },
        400,
      );
      await call("PATCH", `/collections/${name}/fields/title`, {
        defaultValue: "Valid default",
      });
      const defaulted = await call("POST", `/items/${name}`, {}, 201);
      assert.equal(defaulted.title, "Valid default");
      assert.equal(defaulted.day, "2026-10-04");
      assert.equal(defaulted.counter, "9007199254740993");
    },
  );
});
