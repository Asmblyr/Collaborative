import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("field rules, dependent choices and nested labels use the ordinary mutation and permission boundary", async (t) => {
  const f = await featureFixture();
  t.after(f.close);
  const regions = `${f.prefix}_regions`,
    places = `${f.prefix}_places`,
    records = `${f.prefix}_records`;
  f.names.push(records, places, regions);
  const { call } = f;
  for (const [name, fields] of [
    [regions, [{ name: "title", type: "text" }]],
    [
      places,
      [
        { name: "title", type: "text" },
        { name: "code", type: "text" },
        { name: "active", type: "boolean", defaultValue: true },
      ],
    ],
    [
      records,
      [
        { name: "title", type: "text" },
        { name: "enabled", type: "boolean", defaultValue: true },
        { name: "note", type: "text" },
        { name: "derived", type: "text" },
        { name: "fixed", type: "text", defaultValue: "server-default" },
      ],
    ],
  ] as const) {
    await call(
      "POST",
      "/collections",
      { name, primaryKey: { name: "id", type: "serial" }, fields },
      201,
    );
  }
  const relation = (
    source: string,
    name: string,
    targetCollection: string,
    reverseField?: string,
  ) =>
    call(
      "POST",
      `/collections/${source}/relations`,
      { name, targetCollection, reverseField },
      201,
    );
  await relation(places, "region", regions, "places");
  await relation(records, "region", regions);
  await relation(records, "place", places, "records");
  await relation(records, "client", regions);
  await call("PUT", `/collections/${records}/fields/client/presentation`, {
    rules: { computed: { relation: "place", field: "region" } },
  });
  const r1 = await call("POST", `/items/${regions}`, { title: "North" }, 201);
  const r2 = await call("POST", `/items/${regions}`, { title: "South" }, 201);
  const p1 = await call(
    "POST",
    `/items/${places}`,
    { title: "A", code: "N-A", region: r1.id },
    201,
  );
  const p2 = await call(
    "POST",
    `/items/${places}`,
    { title: "B", code: "S-B", region: r2.id },
    201,
  );
  const inactive = await call(
    "POST",
    `/items/${places}`,
    { title: "Old", region: r1.id, active: false },
    201,
  );
  await call("PUT", `/collections/${records}/fields/note/presentation`, {
    rules: {
      requiredWhen: {
        mode: "all",
        rules: [{ field: "enabled", operator: "eq", value: true }],
      },
    },
  });
  await call("PUT", `/collections/${records}/fields/derived/presentation`, {
    rules: { computed: { relation: "place", field: "code" } },
  });
  await call("PUT", `/collections/${records}/fields/fixed/presentation`, {
    rules: { readonly: true, hidden: true },
  });
  const relationFilter = {
    logic: "and",
    children: [
      { field: "region", op: "eq", value: { kind: "field", field: "region" } },
      { field: "active", op: "eq", value: { kind: "literal", value: true } },
    ],
  };
  await call("PUT", `/collections/${records}/fields/place/presentation`, {
    relationFilter,
  });

  await t.test(
    "create defaults and partial updates enforce required and computed rules",
    async () => {
      await call("POST", `/items/${records}`, {}, 400);
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, derived: "override" },
        400,
      );
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, fixed: "override" },
        400,
      );
      const row = await call(
        "POST",
        `/items/${records}`,
        { title: "Valid", note: "yes", region: r1.id, place: p1.id },
        201,
      );
      assert.equal(row.derived, "N-A");
      assert.equal(row.client, r1.id);
      assert.equal(row.fixed, "server-default");
      await call("PATCH", `/items/${records}/${row.id}`, { note: " " }, 400);
      await call(
        "PATCH",
        `/items/${records}/${row.id}`,
        { derived: "manual" },
        400,
      );
      await call("PATCH", `/items/${records}/${row.id}`, {
        enabled: false,
        note: null,
      });
      await call(
        "PATCH",
        `/items/${records}/${row.id}`,
        { enabled: true },
        400,
      );
      const updated = await call("PATCH", `/items/${records}/${row.id}`, {
        region: r2.id,
        place: p2.id,
      });
      assert.equal(updated.derived, "S-B");
      assert.equal(updated.client, r2.id);
      await call("PATCH", `/items/${places}/${p2.id}`, { code: "" });
      assert.equal(
        (
          await call("PATCH", `/items/${records}/${row.id}`, {
            title: "refresh",
          })
        ).derived,
        "",
      );
      await call("PATCH", `/items/${places}/${p2.id}`, { code: null });
      assert.equal(
        (
          await call("PATCH", `/items/${records}/${row.id}`, {
            title: "refresh-null",
          })
        ).derived,
        null,
      );
    },
  );
  await t.test(
    "choice constraints reject direct API bypasses and parent changes",
    async () => {
      for (const values of [
        { place: p1.id },
        { region: r2.id, place: p1.id },
        { region: r1.id, place: inactive.id },
      ]) {
        await call(
          "POST",
          `/items/${records}`,
          { enabled: false, ...values },
          400,
        );
      }
      const row = await call(
        "POST",
        `/items/${records}`,
        { enabled: false, region: r1.id, place: p1.id },
        201,
      );
      await call(
        "PATCH",
        `/items/${records}/${row.id}`,
        { region: r2.id },
        400,
      );
      await call("PATCH", `/items/${places}/${p1.id}`, { active: false });
      // Existing archived choices may remain on an unrelated edit.
      await call("PATCH", `/items/${records}/${row.id}`, {
        title: "Unrelated",
      });
      await call("PATCH", `/items/${records}/${row.id}`, { place: p1.id }, 400);
      await call("PATCH", `/items/${places}/${p1.id}`, { active: true });
      await call("PATCH", `/items/${records}/${row.id}`, {
        region: null,
        place: null,
      });
    },
  );
  await t.test(
    "bulk and nested commits roll back when any row violates a field rule",
    async () => {
      const a = await call(
        "POST",
        `/items/${records}`,
        { enabled: false, note: "filled" },
        201,
      );
      const b = await call(
        "POST",
        `/items/${records}`,
        { enabled: false },
        201,
      );
      await call(
        "PATCH",
        `/items/${records}`,
        { ids: [String(a.id), String(b.id)], values: { enabled: true } },
        400,
      );
      assert.equal(
        (await call("GET", `/items/${records}/${a.id}`)).enabled,
        false,
      );
      await call(
        "POST",
        `/items/${records}/commit`,
        {
          values: { title: "root", enabled: false },
          references: { place: { values: { title: "nested" } } },
        },
        400,
      );
      assert.equal(
        Number(
          (await f
            .db(places)
            .where({ title: "nested" })
            .count("* as n")
            .first())!.n,
        ),
        0,
      );
    },
  );
  await t.test(
    "metadata validation rejects cycles, incompatible operands and aliases as conditions",
    async () => {
      await call(
        "PUT",
        `/collections/${places}/fields/code/presentation`,
        { rules: { computed: { relation: "region", field: "title" } } },
        400,
      );
      await call(
        "PUT",
        `/collections/${records}/fields/place/presentation`,
        {
          relationFilter: {
            logic: "and",
            children: [
              {
                field: "active",
                op: "eq",
                value: { kind: "literal", value: {} },
              },
            ],
          },
        },
        400,
      );
      await call(
        "PUT",
        `/collections/${records}/fields/note/presentation`,
        {
          rules: {
            requiredWhen: {
              mode: "all",
              rules: [{ field: "missing", operator: "empty" }],
            },
          },
        },
        400,
      );
    },
  );
  await t.test(
    "nested labels respect per-hop read grants and row restrictions",
    async () => {
      await call("PUT", `/collections/${records}/display`, {
        displayField: "title",
        displayTemplate: "{{place.region.title}} · {{place.title}}",
      });
      const row = await call(
        "POST",
        `/items/${records}`,
        { title: "fallback", enabled: false, region: r1.id, place: p1.id },
        201,
      );
      const labels = async (headers = f.adminHeaders) =>
        (
          await f.app.inject({
            method: "GET",
            url: `/items/${records}`,
            headers,
          })
        ).json().labels;
      assert.equal((await labels())[row.id], "North · A");
      await f.grant(records, "read", [
        "title",
        "enabled",
        "note",
        "region",
        "place",
        "derived",
      ]);
      await f.grant(records, "create");
      await f.grant(records, "update");
      await f.grant(places, "read", ["title", "region", "active"]);
      await f.grant(regions, "read", ["title"]);
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, region: r1.id, place: p1.id },
        403,
        f.memberHeaders,
      );
      const sourceId = (
        await f.db("asmblyr_collections").where({ name: records }).first("id")
      ).id;
      await f
        .db("asmblyr_permissions")
        .where({ collection_id: sourceId, action: "read" })
        .update({ fields: ["title", "note", "place", "derived", "client"] });
      const catalogResponse = await f.app.inject({
        method: "GET",
        url: "/collections",
        headers: f.memberHeaders,
      });
      const restricted = catalogResponse
        .json()
        .data.find((c: { name: string }) => c.name === records);
      assert.equal(
        restricted.fields.find((f: { name: string }) => f.name === "note")
          .presentation.rules.requiredWhen,
        undefined,
      );
      assert.equal(
        restricted.fields.find((f: { name: string }) => f.name === "place")
          .presentation.relationFilter,
        undefined,
      );
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, region: r1.id, place: p1.id },
        403,
        f.memberHeaders,
      );
      await f
        .db("asmblyr_permissions")
        .where({ collection_id: sourceId, action: "read" })
        .update({
          fields: [
            "title",
            "note",
            "enabled",
            "region",
            "place",
            "derived",
            "client",
          ],
        });
      await f.grant(places, "read", ["code"]);
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, region: r1.id, place: p1.id },
        201,
        f.memberHeaders,
      );
      assert.equal((await labels(f.memberHeaders))[row.id], "North · A");
      await f
        .db("asmblyr_permissions")
        .where({ collection_id: sourceId, action: "create" })
        .update({
          fields: ["title", "enabled", "note", "region", "place", "fixed"],
        });
      await call(
        "POST",
        `/items/${records}`,
        { enabled: false, region: r1.id, place: p1.id },
        403,
        f.memberHeaders,
      );
      await f
        .db("asmblyr_permissions")
        .where({ collection_id: sourceId, action: "create" })
        .update({ fields: ["*"] });

      await f
        .db("asmblyr_permissions")
        .where({
          collection_id: (
            await f
              .db("asmblyr_collections")
              .where({ name: regions })
              .first("id")
          ).id,
          action: "read",
        })
        .update({
          row_filter: JSON.stringify({
            logic: "and",
            children: [
              {
                field: "title",
                op: "eq",
                value: { kind: "literal", value: "South" },
              },
            ],
          }),
        });
      assert.equal((await labels(f.memberHeaders))[row.id], "fallback");
      await call(
        "PUT",
        `/collections/${records}/display`,
        {
          displayField: "title",
          displayTemplate: "{{place.region.places.title}}",
        },
        400,
      );
    },
  );
  await t.test(
    "to-many aliases can be placed in tabs without becoming scalar conditions",
    async () => {
      const layout = {
        version: 1,
        tabs: [
          {
            id: "main",
            label: "Related",
            children: [
              {
                id: "group",
                kind: "group",
                label: "Places",
                description: "",
                collapsible: false,
                collapsed: false,
                children: [
                  {
                    id: "places",
                    kind: "field",
                    field: "places",
                    width: "full",
                  },
                ],
              },
            ],
          },
        ],
      };
      await call("PUT", `/collections/${regions}/form`, layout);
      await call(
        "PUT",
        `/collections/${regions}/fields/title/presentation`,
        {
          rules: {
            requiredWhen: {
              mode: "all",
              rules: [{ field: "places", operator: "notEmpty" }],
            },
          },
        },
        400,
      );
    },
  );
});
