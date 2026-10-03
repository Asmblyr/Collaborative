import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";
import type { FormLayout, FormNode } from "../src/collections/form-layout.js";
import { recordLabelPlan } from "../src/items/record-label.js";

const repeater = {
  minItems: 1,
  maxItems: 3,
  labelField: "role",
  fields: [
    {
      name: "role",
      label: "Role",
      type: "text",
      interface: "select",
      required: true,
      width: "half",
      options: [{ value: "user", label: "User" }],
    },
    {
      name: "message",
      label: "Message",
      type: "text",
      interface: "markdown",
      required: true,
      width: "full",
    },
    {
      name: "count",
      label: "Count",
      type: "integer",
      interface: "auto",
      required: false,
      width: "half",
    },
  ],
};
const node = (field: string): FormNode => ({
  id: `field_${field}`,
  kind: "field",
  field,
  width: "full",
});

test("relation date overrides keep ISO labels instead of falling back to the primary key", () => {
  const plan = recordLabelPlan(
    { primaryKey: { name: "id" } },
    [{ name: "date", type: "datetime" }],
    ["*"],
    "date",
  );
  assert.equal(
    plan.label({ id: "record", date: new Date("2026-09-30T12:30:00Z") }),
    "2026-09-30T12:30:00.000Z",
  );
});

test("repeater validates all API writes and defaults, preserving unknown JSON keys and untouched legacy values", async () => {
  const f = await featureFixture(),
    name = `${f.prefix}_repeat`;
  f.names.push(name);
  const { call, db } = f;
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "messages", type: "json" },
        ],
      },
      201,
    );
    const legacy = await call(
      "POST",
      `/items/${name}`,
      { messages: { legacy: "original" } },
      201,
    );
    const endpoint = `/collections/${name}/fields/messages/presentation`;
    await call("PUT", endpoint, { interface: "repeater", repeater });
    await call("PATCH", `/items/${name}/${legacy.id}`, {
      title: "Other field",
    });
    assert.deepEqual(
      (await call("GET", `/items/${name}/${legacy.id}`)).messages,
      { legacy: "original" },
    );
    const valid = [
      {
        role: "user",
        message: "**Hello**",
        count: 2,
        legacy: { preserved: true },
      },
    ];
    const created = await call(
      "POST",
      `/items/${name}`,
      { messages: valid },
      201,
    );
    assert.deepEqual(created.messages, valid);
    for (const messages of [
      [],
      [{ role: "admin", message: "x" }],
      [{ role: "user", message: " " }],
      [{ role: "user", message: "x", count: "2" }],
      [null],
      Array(4).fill(valid[0]),
    ]) {
      await call("POST", `/items/${name}`, { messages }, 400);
      await call("PATCH", `/items/${name}/${created.id}`, { messages }, 400);
      await call(
        "PATCH",
        `/items/${name}`,
        { ids: [created.id, legacy.id], values: { messages } },
        400,
      );
    }
    assert.deepEqual(
      (await call("GET", `/items/${name}/${created.id}`)).messages,
      valid,
    );
    await call(
      "PATCH",
      `/collections/${name}/fields/messages`,
      { defaultValue: [] },
      400,
    );
    await call("PATCH", `/collections/${name}/fields/messages`, {
      defaultValue: valid,
    });
    assert.deepEqual(
      (await call("POST", `/items/${name}`, {}, 201)).messages,
      valid,
    );
    await call(
      "PUT",
      endpoint,
      { interface: "repeater", repeater: { ...repeater, maxItems: 0 } },
      400,
    );
    await call(
      "PUT",
      endpoint,
      {
        interface: "repeater",
        repeater: {
          ...repeater,
          fields: [...repeater.fields, repeater.fields[0]],
        },
      },
      400,
    );
    await call(
      "PUT",
      endpoint,
      {
        interface: "repeater",
        repeater: {
          ...repeater,
          fields: [{ ...repeater.fields[0], name: "constructor" }],
        },
      },
      400,
    );
    await call(
      "PUT",
      endpoint,
      {
        interface: "repeater",
        repeater: {
          ...repeater,
          fields: [
            {
              ...repeater.fields[0],
              options: [{ value: "changed", label: "Changed" }],
            },
          ],
        },
      },
      400,
    );
    assert.deepEqual(
      (await db(name).where({ id: legacy.id }).first()).messages,
      { legacy: "original" },
    );
    await call(
      "PUT",
      `/collections/${name}/fields/title/presentation`,
      { interface: "repeater", repeater },
      400,
    );
  } finally {
    await f.close();
  }
});

test("form layout validates references and nesting, respects grants, cleans deleted fields and can reset", async () => {
  const f = await featureFixture(),
    name = `${f.prefix}_form`;
  f.names.push(name);
  const { call, memberHeaders } = f;
  try {
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "secret", type: "text" },
          { name: "note", type: "text" },
        ],
      },
      201,
    );
    const layout: FormLayout = {
      version: 1,
      tabs: [
        {
          id: "main",
          label: "Main",
          children: [node("title"), node("secret")],
        },
        {
          id: "details",
          label: "Details",
          children: [
            {
              id: "section",
              kind: "group",
              label: "Details",
              description: "",
              collapsible: true,
              collapsed: true,
              when: {
                mode: "all",
                rules: [
                  {
                    field: "secret",
                    operator: "eq",
                    value: "sensitive-literal",
                  },
                ],
              },
              children: [node("note")],
            },
          ],
        },
      ],
    };
    const endpoint = `/collections/${name}/form`;
    await call("PUT", endpoint, layout);
    const catalog = await call("GET", "/collections");
    assert.deepEqual(
      catalog.find((c: { name: string }) => c.name === name).formLayout,
      layout,
    );
    await call("POST", `/items/${name}`, {}, 400); // UI visibility never relaxes API requiredness.
    await call("PUT", endpoint, layout, 403, memberHeaders);
    await f.grant(name, "read", ["title", "note"]);
    const limited = await call(
      "GET",
      "/collections",
      undefined,
      200,
      memberHeaders,
    );
    assert.equal(JSON.stringify(limited).includes("sensitive-literal"), false);
    assert.equal(
      JSON.stringify(limited[0].formLayout).includes('"secret"'),
      false,
    );
    for (const bad of [
      { ...layout, version: 2 },
      { ...layout, extra: true },
      {
        version: 1,
        tabs: [
          {
            id: "main",
            label: "Main",
            children: [node("title"), node("title")],
          },
        ],
      },
      {
        version: 1,
        tabs: [{ id: "main", label: "Main", children: [node("missing")] }],
      },
      {
        version: 1,
        tabs: [
          {
            id: "main",
            label: "Main",
            children: [
              {
                ...node("title"),
                when: {
                  mode: "all",
                  rules: [{ field: "title", operator: "empty" }],
                },
              },
            ],
          },
        ],
      },
    ]) {
      await call("PUT", endpoint, bad, 400);
    }
    await call("PUT", `/collections/asmblyr_users/form`, layout, 403);
    let nested: FormNode = node("title");
    for (let depth = 1; depth <= 4; depth++) {
      nested = {
        id: `group_${depth}`,
        kind: "group",
        label: "Group",
        description: "",
        collapsible: true,
        collapsed: false,
        children: [nested],
      };
      await call(
        "PUT",
        endpoint,
        {
          version: 1,
          tabs: [{ id: "main", label: "Main", children: [nested] }],
        },
        depth <= 3 ? 200 : 400,
      );
    }
    await call("PUT", endpoint, layout);
    await call("DELETE", `/collections/${name}/fields/secret`, undefined, 204);
    await call(
      "POST",
      `/collections/${name}/fields`,
      { name: "secret", type: "text" },
      201,
    );
    const next = (await call("GET", "/collections")).find(
      (c: { name: string }) => c.name === name,
    ).formLayout;
    assert.equal(JSON.stringify(next).includes("secret"), false);
    const reset = await f.app.inject({
      method: "PUT",
      url: endpoint,
      headers: { ...f.adminHeaders, "content-type": "application/json" },
      payload: "null",
    });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal(reset.json().data, null);
  } finally {
    await f.close();
  }
});

test("value displays validate types; composite labels work across search and relations without leaking hidden fields", async () => {
  const f = await featureFixture(),
    parents = `${f.prefix}_parent`,
    name = `${f.prefix}_labels`,
    junction = `${f.prefix}_junction`;
  f.names.push(junction, name, parents);
  const { call, memberHeaders } = f;
  try {
    await call(
      "POST",
      "/collections",
      { name: parents, fields: [{ name: "title", type: "text" }] },
      201,
    );
    await call(
      "POST",
      "/collections",
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
          { name: "amount", type: "decimal" },
          { name: "date", type: "datetime" },
        ],
      },
      201,
    );
    await call(
      "POST",
      `/collections/${parents}/relations`,
      {
        kind: "m2m",
        name: "children",
        targetCollection: name,
        junctionCollection: junction,
        sourceKey: "parent_id",
        targetKey: "child_id",
      },
      201,
    );
    await call(
      "POST",
      `/collections/${name}/relations`,
      {
        kind: "m2o",
        name: "parent",
        targetCollection: parents,
        reverseField: "owned",
      },
      201,
    );
    const parent = await call(
      "POST",
      `/items/${parents}`,
      { title: "Parent" },
      201,
    );
    const child = await call(
      "POST",
      `/items/${name}`,
      { title: "UniqueLabel", secret: "Sensitive", parent: parent.id },
      201,
    );
    await call(
      "POST",
      `/items/${parents}/${parent.id}/relations/children/links/to/${child.id}`,
      {},
      201,
    );
    await call("PUT", `/collections/${name}/display`, {
      displayField: "title",
      displayTemplate: "{{title}} · {{secret}}",
    });
    const search = async (headers = f.adminHeaders) =>
      (
        await f.app.inject({
          method: "GET",
          url: "/search?q=UniqueLabel",
          headers,
        })
      )
        .json()
        .items.find((r: { collection: string }) => r.collection === name);
    assert.equal((await search()).label, "UniqueLabel · Sensitive");
    for (const alias of ["children", "owned"]) {
      const items = await call(
        "GET",
        `/items/${parents}/${parent.id}/relations/${alias}`,
      );
      assert.equal(items[0].label, "UniqueLabel · Sensitive");
    }
    const related = await call("GET", `/items/${parents}/${parent.id}/related`);
    assert.ok(
      related.every(
        (g: { items: { label: string }[] }) =>
          g.items[0].label === "UniqueLabel · Sensitive",
      ),
    );
    await f.grant(name, "read", ["title", "parent"]);
    await f.grant(parents, "read");
    assert.equal((await search(memberHeaders)).label, "UniqueLabel");
    for (const alias of ["children", "owned"])
      assert.equal(
        (
          await call(
            "GET",
            `/items/${parents}/${parent.id}/relations/${alias}`,
            undefined,
            200,
            memberHeaders,
          )
        )[0].label,
        "UniqueLabel",
      );
    const visible = (
      await call("GET", "/collections", undefined, 200, memberHeaders)
    ).find((c: { name: string }) => c.name === name);
    assert.equal(visible.displayTemplate, null);
    for (const displayTemplate of [
      "{{missing}}",
      "{{title.foo}}",
      "{{constructor}}",
      "{{title}} {invalid}",
    ])
      await call(
        "PUT",
        `/collections/${name}/display`,
        { displayField: null, displayTemplate },
        400,
      );
    await call("PUT", `/collections/${name}/fields/amount/presentation`, {
      display: {
        kind: "number",
        decimals: 2,
        grouping: true,
        prefix: "",
        suffix: " USD",
      },
    });
    await call("PUT", `/collections/${name}/fields/date/presentation`, {
      display: {
        kind: "date",
        format: "datetime",
        timeZone: "Asia/Yekaterinburg",
      },
    });
    await call("PUT", `/collections/${name}/fields/title/presentation`, {
      display: {
        kind: "status",
        statuses: [{ value: "UniqueLabel", label: "Ready", color: "green" }],
      },
    });
    await call(
      "PUT",
      `/collections/${name}/fields/date/presentation`,
      {
        display: { kind: "date", format: "datetime", timeZone: "Invalid/Zone" },
      },
      400,
    );
    await call(
      "PUT",
      `/collections/${name}/fields/title/presentation`,
      {
        display: {
          kind: "number",
          decimals: 2,
          grouping: true,
          prefix: "",
          suffix: "",
        },
      },
      400,
    );
    await call("DELETE", `/collections/${name}/fields/secret`, undefined, 204);
    assert.equal((await search()).label, "UniqueLabel");
    assert.equal(
      (await f.db("asmblyr_collections").where({ name }).first())
        .display_template,
      null,
    );
  } finally {
    await f.close();
  }
});
