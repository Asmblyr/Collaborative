import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { defaultCollectionState } from "@asmblyr/contracts";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { loadAccess } from "../src/permissions/access.js";

test("system state: defaults, protected structure, editable choices, adoption, permissions and MCP", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const admin = await authorizeTestApp(app, db);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const name = `test_state_${suffix}`,
    imported = `test_state_import_${suffix}`,
    plain = `test_state_plain_${suffix}`;
  const userId = randomUUID();
  let policyId: string | undefined;
  const state = defaultCollectionState();
  const create = (payload: object) =>
    app.inject({ method: "POST", url: "/collections", payload });
  const settings = (collection: string, payload: object) =>
    app.inject({
      method: "PATCH",
      url: `/collections/${collection}/settings`,
      payload,
    });
  const post = (payload: object) =>
    app.inject({ method: "POST", url: `/items/${name}`, payload });
  try {
    const created = await create({
      name,
      state,
      fields: [{ name: "title", type: "text" }],
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.deepEqual(created.json().data.state, state);
    const status = created
      .json()
      .data.fields.find((field: { name: string }) => field.name === "status");
    assert.equal(status.defaultValue, "published");
    assert.equal(status.presentation.interface, "select");
    assert.equal(status.presentation.display.statuses[2].label, "Архивировано");
    const published = await post({ title: "Published" });
    assert.equal(published.statusCode, 201, published.body);
    assert.equal(published.json().data.status, "published");
    for (const value of ["draft", "archived"])
      assert.equal(
        (await post({ title: value, status: value })).statusCode,
        201,
      );
    for (const value of [null, "unknown", "", 1])
      assert.equal((await post({ status: value })).statusCode, 400);
    const inserted = await db(name)
      .insert({ title: "Direct database insert" })
      .returning("status");
    assert.equal(inserted[0].status, "published");
    // Visibility is an explicit filter, not a permission rule.
    const all = await app.inject({ method: "GET", url: `/items/${name}` });
    assert.equal(all.json().page.total, "4");
    const filter = JSON.stringify({
      logic: "and",
      children: [
        { field: "status", op: "notIn", value: ["draft", "archived"] },
      ],
    });
    const visible = await app.inject({
      method: "GET",
      url: `/items/${name}?filter=${encodeURIComponent(filter)}&limit=1`,
    });
    assert.equal(visible.statusCode, 200, visible.body);
    assert.equal(visible.json().page.total, "2");
    assert.equal(visible.json().data.length, 1);
    const id = published.json().data.id;
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/items/${name}/${id}`,
          payload: { status: "draft" },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: `/items/${name}/${id}` })).json()
        .data.status,
      "draft",
    );
    for (const request of [
      { method: "DELETE" as const, url: `/collections/${name}/fields/status` },
      {
        method: "PATCH" as const,
        url: `/collections/${name}/fields/status`,
        payload: { defaultValue: "draft" },
      },
      {
        method: "PUT" as const,
        url: `/collections/${name}/fields/status/presentation`,
        payload: status.presentation,
      },
      {
        method: "PUT" as const,
        url: `/collections/${name}/fields/status/configuration`,
        payload: { field: { nullable: true } },
      },
    ])
      assert.ok([400, 403].includes((await app.inject(request)).statusCode));
    assert.equal((await settings(name, { state: null })).statusCode, 400);
    const removed = {
      ...state,
      statuses: state.statuses.filter((option) => option.value !== "draft"),
    };
    assert.equal(
      (await settings(name, { state: removed, displayName: "Must roll back" }))
        .statusCode,
      409,
    );
    assert.equal(
      (await db("asmblyr_collections").where({ name }).first("display_name"))
        .display_name,
      null,
    );
    const configured = {
      ...state,
      defaultValue: "review",
      statuses: [
        ...state.statuses.map((option) =>
          option.value === "draft"
            ? { ...option, label: "В работе", color: "blue" as const }
            : option,
        ),
        {
          value: "review",
          label: "На проверке",
          color: "violet" as const,
          hidden: true,
        },
      ],
    };
    assert.equal((await settings(name, { state: configured })).statusCode, 200);
    assert.equal(
      (await post({ title: "Review" })).json().data.status,
      "review",
    );
    assert.equal(
      (await db(name).insert({ title: "Direct review" }).returning("status"))[0]
        .status,
      "review",
    );
    assert.equal(
      (await db(name).where({ id }).first("status")).status,
      "draft",
    );
    for (const bad of [
      { ...state, defaultValue: "missing" },
      { ...state, field: "title" },
      { ...state, statuses: [] },
      { ...state, statuses: [...state.statuses, state.statuses[0]] },
    ])
      assert.equal((await settings(name, { state: bad })).statusCode, 400);

    assert.equal(
      (
        await create({
          name: imported,
          fields: [{ name: "status", type: "text" }],
        })
      ).statusCode,
      201,
    );
    await db(imported).insert([
      { status: "published" },
      { status: null },
      { status: "legacy" },
    ]);
    assert.equal((await settings(imported, { state })).statusCode, 409);
    assert.equal(
      (await db("asmblyr_collections").where({ name: imported }).first("state"))
        .state,
      null,
    );
    const withLegacy = {
      ...state,
      statuses: [
        ...state.statuses,
        { value: "legacy", label: "Старое", color: "gray", hidden: false },
      ],
    };
    const adopted = await settings(imported, { state: withLegacy });
    assert.equal(adopted.statusCode, 200, adopted.body);
    assert.equal(adopted.json().data.fields[0].nullable, true);
    assert.deepEqual(
      (await db(imported).select("status")).map((row) => row.status).sort(),
      ["legacy", "published", null].sort(),
    );
    assert.equal((await create({ name: plain })).statusCode, 201);
    await db(plain).insert({});
    assert.equal((await settings(plain, { state })).statusCode, 200);
    assert.equal((await db(plain).first("status")).status, "published");

    await db("asmblyr_users").insert({
      id: userId,
      email: `${userId}@example.test`,
      superuser: false,
    });
    policyId = (
      await app.inject({
        method: "POST",
        url: "/policies",
        payload: { name: `State ${suffix}` },
      })
    ).json().data.id;
    for (const action of ["read", "create", "update"]) {
      const grant = await app.inject({
        method: "POST",
        url: "/permissions",
        payload: { collection: name, action, fields: ["title"] },
      });
      assert.equal(grant.statusCode, 201, grant.body);
      await app.inject({
        method: "PUT",
        url: `/policies/${policyId}/permissions/${grant.json().data.id}`,
      });
    }
    await app.inject({
      method: "PUT",
      url: `/policies/${policyId}/users/${userId}`,
    });
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(db, userId)).accessToken}`,
    };
    const catalog = (
      await app.inject({ method: "GET", url: "/collections", headers })
    ).json().data;
    const restricted = catalog.find(
      (entry: { name: string }) => entry.name === name,
    );
    assert.equal(restricted.state, null);
    assert.ok(
      !restricted.fields.some(
        (field: { name: string }) => field.name === "status",
      ),
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/collections/${name}/settings`,
          headers,
          payload: { state },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/items/${name}/${id}`,
          headers,
          payload: { status: "published" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/items/${name}?filter=${encodeURIComponent(filter)}`,
          headers,
        })
      ).statusCode,
      403,
    );
    const own = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      headers,
      payload: { title: "Limited creator" },
    });
    assert.equal(own.statusCode, 201, own.body);
    assert.equal(own.json().data.status, undefined);
    assert.equal(
      (await db(name).where({ title: "Limited creator" }).first("status"))
        .status,
      "review",
    );

    const context = {
      page: "items" as const,
      collection: name,
      workspaceId: null,
      table: {
        page: 1,
        size: 25,
        sort: "id",
        direction: "asc" as const,
        q: "",
        filter: "",
        selectedCount: 0,
        editorOpen: false,
      },
    };
    const adminAccess = {
      principal: { id: admin.id, kind: "user" as const, superuser: true },
      grants: new Map(),
    };
    const tools = (await createContextTools(
      db,
      adminAccess,
      context,
      async () => adminAccess,
    ))!;
    const described = JSON.parse(
      JSON.stringify(await tools.execute("describe_collection", {})),
    );
    assert.deepEqual(described.state, configured);
    assert.equal(
      described.fields.find(
        (field: { name: string }) => field.name === "status",
      ).options[1].label,
      "В работе",
    );
    const access = await loadAccess(db, headers.authorization);
    const limitedTools = (await createContextTools(
      db,
      access,
      context,
      async () => access,
    ))!;
    const limited = JSON.parse(
      JSON.stringify(await limitedTools.execute("describe_collection", {})),
    );
    assert.equal(limited.state, undefined);
    assert.ok(!JSON.stringify(limited).includes("review"));
  } finally {
    for (const collection of [name, imported, plain]) {
      await db.schema.dropTableIfExists(collection);
      await db("asmblyr_collections").where({ name: collection }).delete();
    }
    if (policyId) await db("asmblyr_policies").where({ id: policyId }).delete();
    await db("asmblyr_users").where({ id: userId }).delete();
    await app.close();
    await db.destroy();
  }
});
