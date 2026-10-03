import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { listRelationItems } from "../src/items/relation-list.js";
import {
  createRelationLink,
  createRelationWithLink,
  getRelationLink,
  updateRelationLink,
} from "../src/items/relation-links.js";
import type { Access } from "../src/permissions/access.js";

test("relation tables and junction forms preserve projection grants, scope and atomic history", async (t) => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const user = await authorizeTestApp(app, database);
  const prefix = `test_rt_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const parents = `${prefix}_parents`,
    children = `${prefix}_children`,
    junction = `${prefix}_links`;
  const names = [junction, children, parents];
  const mutation = {
    requestId: randomUUID(),
    actor: { kind: "user" as const, id: user.id },
  };
  const limited = (grants: [string, string[]][]): Access => ({
    principal: {
      kind: "user",
      id: user.id,
      email: "test@example.test",
      superuser: false,
      sessionId: "test",
    },
    grants: new Map(grants),
  });
  async function call(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
    status = 200,
  ) {
    const result = await app.inject({ method, url, payload });
    assert.equal(result.statusCode, status, result.body);
    return status === 204 ? undefined : result.json();
  }
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
        name: children,
        primaryKey: { name: "key", type: "text" },
        timestamps: { createdAt: true },
        fields: [
          { name: "title", type: "text" },
          { name: "private", type: "text" },
          { name: "rank", type: "integer" },
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
        targetCollection: children,
        junctionCollection: junction,
        sourceKey: "parent_id",
        targetKey: "child_id",
      },
      201,
    );
    await call(
      "POST",
      `/collections/${children}/relations`,
      {
        kind: "m2o",
        name: "owner",
        targetCollection: parents,
        reverseField: "owned",
        nullable: true,
      },
      201,
    );
    await call(
      "POST",
      `/collections/${junction}/fields`,
      { name: "role", type: "text", required: true },
      201,
    );
    await call(
      "POST",
      `/collections/${junction}/fields`,
      { name: "note", type: "text" },
      201,
    );
    const parent = (
      await call("POST", `/items/${parents}`, { title: "Parent" }, 201)
    ).data.id as string;
    const other = (
      await call("POST", `/items/${parents}`, { title: "Other" }, 201)
    ).data.id as string;
    const address = { collection: parents, id: parent, field: "children" };
    const path = `/items/${parents}/${parent}/relations/children`;
    const presentation = `/collections/${parents}/fields/children/presentation`;
    for (let index = 0; index < 12; index++) {
      await call(
        "POST",
        `/items/${children}`,
        {
          key: `child_${index}`,
          title: `Child ${index}`,
          private: `Secret ${index}`,
          rank: index,
          owner: parent,
        },
        201,
      );
      await call(
        "POST",
        `${path}/links/to/child_${index}`,
        { role: "Reader", note: "Internal" },
        201,
      );
    }
    await t.test(
      "default columns identify records without arbitrary or unreadable fields",
      async () => {
        const view = await call("GET", path);
        assert.deepEqual(view.display.columns, ["key", "title"]);
        assert.deepEqual(Object.keys(view.data[0].values), ["key", "title"]);
        const access = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["rank"]],
        ]);
        const restricted = await listRelationItems(
          database,
          address,
          access,
          {},
        );
        assert.deepEqual(restricted.display.columns, ["key"]);
        assert.deepEqual(Object.keys(restricted.data[0].values), ["key"]);
        assert.equal(restricted.data[0].label, restricted.data[0].id);
      },
    );
    await t.test(
      "settings validate physical fields, persist and determine columns, labels, sort and pages",
      async () => {
        await call("PUT", presentation, {
          relation: {
            layout: "table",
            columns: ["title", "rank", "created_at"],
            labelField: "title",
            sortField: "rank",
            direction: "desc",
            pageSize: 10,
            allowCreate: false,
            allowSelect: false,
          },
        });
        const view = await call("GET", path);
        assert.equal(view.page.total, "12");
        assert.equal(view.data.length, 10);
        assert.equal(view.data[0].id, "child_11");
        assert.equal(view.data[0].label, "Child 11");
        assert.deepEqual(Object.keys(view.data[0].values), [
          "title",
          "rank",
          "created_at",
        ]);
        assert.equal(view.display.allowCreate, false);
        assert.equal(view.abilities.create, true);
        const second = await call("GET", `${path}?page=2`);
        assert.deepEqual(
          second.data.map((v: { id: string }) => v.id),
          ["child_1", "child_0"],
        );
        const sorted = await call("GET", `${path}?sort=rank&direction=asc`);
        assert.equal(sorted.data[0].id, "child_0");
        const searched = await call("GET", `${path}?q=Child%2011`);
        assert.equal(searched.page.total, "1");
        await call("GET", `${path}?sort=missing`, undefined, 400);
        for (const relation of [
          { columns: ["private", "private"] },
          { columns: ["missing"] },
          { columns: ["owned"] },
          { pageSize: 10000 },
          { sortField: "missing" },
          { allowCreate: "false" },
          { labelField: "missing" },
          { columns: ["title;drop"] },
          { layout: "cards" },
          { unknown: true },
        ]) {
          await call("PUT", presentation, { relation }, 400);
        }
        await call(
          "PUT",
          `/collections/${children}/fields/title/presentation`,
          { relation: { layout: "list" } },
          400,
        );
        const catalog = await call("GET", "/collections");
        const found = catalog.data
          .find((c: { name: string }) => c.name === parents)
          .fields.find((f: { name: string }) => f.name === "children");
        assert.deepEqual(found.presentation.relation.columns, [
          "title",
          "rank",
          "created_at",
        ]);
      },
    );
    await t.test(
      "configured columns and hidden sorting never bypass field read grants",
      async () => {
        await call("PUT", presentation, {
          relation: {
            columns: ["private", "title"],
            labelField: "private",
            sortField: "private",
          },
        });
        const access = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title"]],
        ]);
        const result = await listRelationItems(database, address, access, {});
        assert.deepEqual(result.display.columns, ["title"]);
        assert.equal(result.page.sort, "key");
        assert.deepEqual(Object.keys(result.data[0].values), ["title"]);
        assert.equal(result.data[0].label, "Child 0");
        assert.deepEqual(result.abilities, {
          create: false,
          attach: false,
          detach: false,
        });
        await assert.rejects(
          listRelationItems(database, address, access, { sort: "private" }),
          { statusCode: 403 },
        );
        await assert.rejects(
          getRelationLink(database, address, result.data[0].linkId, access),
          { statusCode: 403 },
        );
        const privateOnly = { relation: { columns: ["private"] } };
        await call("PUT", presentation, privateOnly);
        assert.deepEqual(
          (await listRelationItems(database, address, access, {})).display
            .columns,
          ["key"],
        );
      },
    );
    await t.test(
      "O2M table uses physical values with the same pagination and sorting contract",
      async () => {
        await call("PUT", `/collections/${parents}/fields/owned/presentation`, {
          relation: {
            columns: ["rank", "title"],
            sortField: "rank",
            direction: "desc",
          },
        });
        const result = await call(
          "GET",
          `/items/${parents}/${parent}/relations/owned`,
        );
        assert.equal(result.data[0].values.rank, 11);
        assert.equal(result.page.total, "12");
        await call(
          "POST",
          `/items/${parents}/${parent}/relations/owned/links/to/child_0`,
          {},
          400,
        );
      },
    );
    await t.test(
      "junction edits are scoped, protected from reassignment, authorized and audited",
      async () => {
        const view = await call("GET", path);
        const row = view.data.find((r: { id: string }) => r.id === "child_0");
        const linkPath = `${path}/links/${row.linkId}`;
        await call("PATCH", linkPath, { role: "Editor" });
        assert.equal((await call("GET", linkPath)).data.role, "Editor");
        await call("PATCH", linkPath, { child_id: "child_1" }, 400);
        await call("PATCH", linkPath, { parent_id: other }, 400);
        await call(
          "GET",
          `/items/${parents}/${other}/relations/children/links/${row.linkId}`,
          undefined,
          404,
        );
        await call(
          "PATCH",
          `/items/${parents}/${other}/relations/children/links/${row.linkId}`,
          { role: "Steal" },
          404,
        );
        const reader = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title"]],
          [`${junction}:read`, ["role"]],
        ]);
        assert.deepEqual(
          await getRelationLink(database, address, row.linkId, reader),
          { id: row.linkId, role: "Editor" },
        );
        await assert.rejects(
          updateRelationLink(
            database,
            address,
            row.linkId,
            { role: "Denied" },
            reader,
            mutation,
          ),
          { statusCode: 403 },
        );
        reader.grants.set(`${junction}:update`, ["role"]);
        await assert.rejects(
          updateRelationLink(
            database,
            address,
            row.linkId,
            { note: "Denied" },
            reader,
            mutation,
          ),
          { statusCode: 403 },
        );
        await updateRelationLink(
          database,
          address,
          row.linkId,
          { role: "Contributor" },
          reader,
          mutation,
        );
        const events = await database("asmblyr_item_events").where({
          collection_name: junction,
          item_id: row.linkId,
          action: "update",
        });
        assert.equal(events.length, 2);
        assert.equal(events[1].actor_id, user.id);
        assert.equal(
          (await database(junction).where({ id: row.linkId }).first()).child_id,
          "child_0",
        );
      },
    );
    await t.test(
      "relation lists search one configured hop with scope, grants and stable pages",
      async () => {
        const searchSetting = `/collections/${children}/relations/owner/search`;
        assert.equal((await call("GET", `${path}?q=Parent`)).page.total, "0");
        await call("PUT", searchSetting, { searchable: true });
        const first = await call("GET", `${path}?q=Parent&limit=5&page=1`);
        const second = await call("GET", `${path}?q=Parent&limit=5&page=2`);
        assert.equal(first.page.total, "12");
        assert.equal(second.page.total, "12");
        assert.equal(first.data.length, 5);
        assert.equal(second.data.length, 5);
        assert.ok(
          !first.data.some((a: { id: string }) =>
            second.data.some((b: { id: string }) => a.id === b.id),
          ),
        );
        assert.equal(
          (
            await call(
              "GET",
              `/items/${parents}/${other}/relations/children?q=Parent`,
            )
          ).page.total,
          "0",
        );
        assert.equal(
          (
            await call(
              "GET",
              `/items/${parents}/${parent}/relations/owned?q=Parent`,
            )
          ).page.total,
          "12",
        );
        const access = limited([
          [`${parents}:read`, ["children", "title"]],
          [`${children}:read`, ["title", "owner"]],
        ]);
        assert.equal(
          (await listRelationItems(database, address, access, { q: "Parent" }))
            .page.total,
          "12",
        );
        access.grants.set(`${parents}:read`, ["children"]);
        assert.equal(
          (await listRelationItems(database, address, access, { q: "Parent" }))
            .page.total,
          "0",
        );
        access.grants.set(`${parents}:read`, ["children", "title"]);
        access.grants.set(`${children}:read`, ["title"]);
        assert.equal(
          (await listRelationItems(database, address, access, { q: "Parent" }))
            .page.total,
          "0",
        );
        await call("PUT", searchSetting, { searchable: false });
        assert.equal((await call("GET", `${path}?q=Parent`)).page.total, "0");
      },
    );
    await t.test(
      "create and attach with mandatory junction fields are atomic and enforce write grants",
      async () => {
        const beforeItems = Number(
          (await database(children).count("* as n").first())!.n,
        );
        const beforeEvents = Number(
          (await database("asmblyr_item_events")
            .whereIn("collection_name", names)
            .count("* as n")
            .first())!.n,
        );
        await call(
          "POST",
          `${path}/records`,
          { item: { key: "failed", title: "Must roll back" }, link: {} },
          400,
        );
        assert.equal(
          Number((await database(children).count("* as n").first())!.n),
          beforeItems,
        );
        assert.equal(
          Number(
            (await database("asmblyr_item_events")
              .whereIn("collection_name", names)
              .count("* as n")
              .first())!.n,
          ),
          beforeEvents,
        );
        const result = await call(
          "POST",
          `${path}/records`,
          { item: { key: "new", title: "New" }, link: { role: "Author" } },
          201,
        );
        assert.equal(result.data.id, "new");
        assert.equal(
          (
            await database(junction)
              .where({ child_id: "new", parent_id: parent })
              .first()
          ).role,
          "Author",
        );
        await call("POST", `${path}/links/to/new`, { role: "Duplicate" }, 409);
        const access = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title"]],
          [`${children}:create`, ["title"]],
          [`${junction}:create`, ["parent_id", "child_id"]],
        ]);
        await assert.rejects(
          createRelationWithLink(
            database,
            address,
            {
              item: { key: "denied", title: "Denied" },
              link: { role: "Admin" },
            },
            access,
            mutation,
          ),
          { statusCode: 403 },
        );
        assert.equal(
          await database(children).where({ key: "denied" }).first(),
          undefined,
        );
        await assert.rejects(
          createRelationLink(
            database,
            { ...address, id: other },
            "new",
            { role: "Denied" },
            access,
            mutation,
          ),
          { statusCode: 403 },
        );
        assert.equal(
          await database(junction)
            .where({ child_id: "new", parent_id: other })
            .first(),
          undefined,
        );
      },
    );
    await t.test(
      "deleted configured fields fall back safely and resetting metadata still works",
      async () => {
        await call("PUT", presentation, {
          relation: {
            columns: ["private"],
            labelField: "private",
            sortField: "private",
          },
        });
        await call(
          "DELETE",
          `/collections/${children}/fields/private`,
          undefined,
          204,
        );
        const result = await call("GET", path);
        assert.deepEqual(result.display.columns, ["key"]);
        assert.equal(result.page.sort, "key");
        await call("PUT", presentation, {});
        assert.equal((await call("GET", path)).display.layout, "table");
      },
    );
  } finally {
    for (const name of names) {
      await database.schema.withSchema("public").dropTableIfExists(name);
      await database("asmblyr_collections").where({ name }).delete();
      await database("asmblyr_item_events")
        .where({ collection_name: name })
        .delete();
    }
    await app.close();
    await database.destroy();
  }
});
