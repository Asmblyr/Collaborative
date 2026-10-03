import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import {
  changeRelationItems,
  createRelationItem,
} from "../src/items/relation-mutations.js";
import { listRelationItems } from "../src/items/relation-list.js";
import { listRelationCandidates } from "../src/items/relation-candidates.js";
import { searchAll } from "../src/items/search.js";
import type { Access } from "../src/permissions/access.js";

test("record labels and relation editing preserve data, rights and atomicity", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const user = await authorizeTestApp(app, database);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const parents = `test_parents_${suffix}`,
    children = `test_children_${suffix}`;
  const tags = `test_labels_${suffix}`,
    bridge = `test_links_${suffix}`;
  const names = [bridge, children, tags, parents];
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
    for (const name of [parents, children, tags])
      await call(
        "POST",
        "/collections",
        {
          name,
          primaryKey: { name: "id", type: "serial" },
          fields: [
            { name: "title", type: "text" },
            { name: "label", type: "text" },
          ],
        },
        201,
      );
    await call(
      "POST",
      `/collections/${children}/relations`,
      {
        kind: "m2o",
        name: "parent_id",
        targetCollection: parents,
        reverseField: "children",
        nullable: true,
        onDelete: "setNull",
      },
      201,
    );
    await call(
      "POST",
      `/collections/${parents}/relations`,
      {
        kind: "m2m",
        name: "tags",
        targetCollection: tags,
        junctionCollection: bridge,
        sourceKey: "parent_id",
        targetKey: "tag_id",
        reverseField: "parents",
      },
      201,
    );
    const parent = (
      await call("POST", `/items/${parents}`, { title: "Parent" }, 201)
    ).data.id;
    const other = (
      await call("POST", `/items/${parents}`, { title: "Other" }, 201)
    ).data.id;
    const tag = (
      await call(
        "POST",
        `/items/${tags}`,
        { title: "Visible", label: "Private label" },
        201,
      )
    ).data.id;
    const child = (
      await call("POST", `/items/${children}`, { title: "Child" }, 201)
    ).data.id;
    const path = `/items/${parents}/${parent}/relations`;
    const address = { collection: parents, id: String(parent), field: "tags" };

    await t.test(
      "configured labels, validation, global search and private field fallback",
      async () => {
        await call("PUT", `/collections/${tags}/display`, {
          displayField: "label",
        });
        await call(
          "PUT",
          `/collections/${tags}/display`,
          { displayField: "missing" },
          400,
        );
        await call(
          "PUT",
          "/collections/asmblyr_users/display",
          { displayField: "email" },
          403,
        );
        await call("PATCH", `${path}/tags`, { attach: [String(tag)] }, 204);
        assert.equal(
          (await call("GET", `${path}/tags`)).data[0].label,
          "Private label",
        );
        const readOnly = limited([
          [`${parents}:read`, ["tags"]],
          [`${tags}:read`, ["title"]],
        ]);
        const result = await listRelationItems(database, address, readOnly, {});
        assert.equal(result.data[0].label, String(tag));
        assert.deepEqual(result.abilities, {
          attach: false,
          detach: false,
          create: false,
        });
        const search = await searchAll(database, readOnly, "Visible");
        assert.equal(
          search.items.find((item) => item.collection === tags)?.label,
          String(tag),
        );
        await assert.rejects(
          changeRelationItems(
            database,
            address,
            { attach: [String(tag)] },
            readOnly,
            mutation,
          ),
          { statusCode: 403 },
        );
        await assert.rejects(
          listRelationItems(
            database,
            address,
            limited([
              [`${parents}:read`, ["title"]],
              [`${tags}:read`, ["*"]],
            ]),
            {},
          ),
          { statusCode: 403 },
        );
      },
    );

    await t.test(
      "M2M is idempotent, paginated and removes only the owned link",
      async () => {
        const responses = await Promise.all(
          [1, 2].map(() =>
            app.inject({
              method: "PATCH",
              url: `${path}/tags`,
              payload: { attach: [String(tag)] },
            }),
          ),
        );
        responses.forEach((response) =>
          assert.equal(response.statusCode, 204, response.body),
        );
        const result = await call("GET", `${path}/tags?limit=1&page=1`);
        assert.equal(Number(result.page.total), 1);
        await call(
          "PATCH",
          `/items/${parents}/${other}/relations/tags`,
          { detach: [result.data[0].linkId] },
          404,
        );
        await call(
          "PATCH",
          `${path}/tags`,
          { detach: [result.data[0].linkId] },
          204,
        );
        assert.equal(
          (await call("GET", `/items/${tags}/${tag}`)).data.title,
          "Visible",
        );
        const created = await call(
          "POST",
          `${path}/tags`,
          { title: "New tag", label: "New label" },
          201,
        );
        assert.equal(
          (await call("GET", `${path}/tags`)).data[0].id,
          created.data.id,
        );
        // A tag linked elsewhere remains eligible; a tag linked here does not.
        await call(
          "PATCH",
          `/items/${parents}/${other}/relations/tags`,
          { attach: [String(tag)] },
          204,
        );
        const choices = await call(
          "GET",
          `${path}/tags/candidates?limit=1&page=1`,
        );
        assert.equal(choices.page.total, "1");
        assert.equal(choices.data[0].id, tag);
        await call("PATCH", `${path}/tags`, { attach: [String(tag)] }, 204);
        assert.equal(
          (await call("GET", `${path}/tags/candidates`)).page.total,
          "0",
        );
        const link = (await call("GET", `${path}/tags`)).data.find(
          (row: { id: string }) => row.id === String(tag),
        );
        await call("PATCH", `${path}/tags`, { detach: [link.linkId] }, 204);
        const createOnly = limited([
          [`${parents}:read`, ["tags"]],
          [`${tags}:read`, ["title"]],
          [`${tags}:create`, ["title"]],
        ]);
        await assert.rejects(
          createRelationItem(
            database,
            address,
            { title: "Denied" },
            createOnly,
            mutation,
          ),
          { statusCode: 403 },
        );
      },
    );

    await t.test(
      "failed batch and failed linked create roll back rows and audit events",
      async () => {
        await call(
          "PATCH",
          `${path}/tags`,
          { attach: [String(tag), "999999999"] },
          404,
        );
        assert.equal(Number((await call("GET", `${path}/tags`)).page.total), 1);
        await call(
          "POST",
          `/collections/${bridge}/fields`,
          { name: "extra", type: "text", nullable: true, required: true },
          201,
        );
        const before = await database(tags)
          .count<{ total: string }>("* as total")
          .first();
        const events = await database("asmblyr_item_events")
          .where({ request_id: mutation.requestId })
          .count("* as total")
          .first();
        const writer = limited([
          [`${parents}:read`, ["tags"]],
          [`${tags}:read`, ["*"]],
          [`${tags}:create`, ["*"]],
          [`${bridge}:create`, ["parent_id", "tag_id"]],
        ]);
        await assert.rejects(
          createRelationItem(
            database,
            address,
            { title: "Rolled back" },
            writer,
            mutation,
          ),
        );
        assert.deepEqual(
          await database(tags).count("* as total").first(),
          before,
        );
        assert.deepEqual(
          await database("asmblyr_item_events")
            .where({ request_id: mutation.requestId })
            .count("* as total")
            .first(),
          events,
        );
      },
    );

    await t.test(
      "O2M candidates filter before search/count/pagination and enforce access",
      async () => {
        const freeA = (
          await call(
            "POST",
            `/items/${children}`,
            { title: "Candidate A", label: "Private A" },
            201,
          )
        ).data.id;
        const freeB = (
          await call(
            "POST",
            `/items/${children}`,
            { title: "Candidate B", label: "Private B" },
            201,
          )
        ).data.id;
        const owned = (
          await call(
            "POST",
            `${path}/children`,
            { title: "Candidate owned" },
            201,
          )
        ).data.id;
        const occupied = (
          await call(
            "POST",
            `/items/${parents}/${other}/relations/children`,
            { title: "Candidate occupied" },
            201,
          )
        ).data.id;
        const choicesPath = `${path}/children/candidates`;
        const all = await call("GET", choicesPath);
        assert.equal(all.page.total, "3");
        assert.deepEqual(
          all.data.map((row: { id: number }) => row.id),
          [child, freeA, freeB],
        );
        const first = await call(
          "GET",
          `${choicesPath}?q=Candidate&limit=1&page=1`,
        );
        const second = await call(
          "GET",
          `${choicesPath}?q=Candidate&limit=1&page=2`,
        );
        assert.equal(first.page.total, "2");
        assert.equal(second.page.total, "2");
        assert.equal(first.data[0].id, freeA);
        assert.equal(second.data[0].id, freeB);
        const filter = encodeURIComponent(
          JSON.stringify({
            logic: "or",
            children: [
              { field: "id", op: "eq", value: owned },
              { field: "id", op: "eq", value: occupied },
            ],
          }),
        );
        assert.equal(
          (await call("GET", `${choicesPath}?filter=${filter}`)).page.total,
          "0",
        );
        const candidateAddress = { ...address, field: "children" };
        const reader = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title", "parent_id"]],
        ]);
        await assert.rejects(
          listRelationCandidates(database, candidateAddress, reader, {}),
          { statusCode: 403 },
        );
        const writer = limited([
          ...reader.grants,
          [`${children}:update`, ["parent_id"]],
        ]);
        const visible = await listRelationCandidates(
          database,
          candidateAddress,
          writer,
          {},
        );
        assert.deepEqual(Object.keys(visible.data[0]).sort(), [
          "id",
          "parent_id",
          "title",
        ]);
        const noAlias = limited([
          [`${parents}:read`, ["title"]],
          [`${children}:read`, ["*"]],
          [`${children}:update`, ["parent_id"]],
        ]);
        await assert.rejects(
          listRelationCandidates(database, candidateAddress, noAlias, {}),
          { statusCode: 403 },
        );
        const noForeignKey = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title"]],
          [`${children}:update`, ["parent_id"]],
        ]);
        await assert.rejects(
          listRelationCandidates(database, candidateAddress, noForeignKey, {}),
          { statusCode: 403 },
        );
        await call(
          "GET",
          `/items/${parents}/999999999/relations/children/candidates`,
          undefined,
          404,
        );

        // A candidate may become occupied after the list is loaded. Nothing gets
        // reassigned, and even earlier writes in the submitted batch roll back.
        await call(
          "PATCH",
          `/items/${parents}/${other}/relations/children`,
          { attach: [String(freeB)] },
          204,
        );
        const conflict = await call(
          "PATCH",
          `${path}/children`,
          { attach: [String(freeA), String(freeB)] },
          409,
        );
        assert.equal(conflict.code, "RELATION_PARENT_CONFLICT");
        assert.equal(
          (await call("GET", `/items/${children}/${freeA}`)).data.parent_id,
          null,
        );
        assert.equal(
          (await call("GET", `/items/${children}/${freeB}`)).data.parent_id,
          other,
        );
        await call(
          "PATCH",
          `${path}/children`,
          { attach: [String(freeA)] },
          204,
        );
        assert.equal((await call("GET", choicesPath)).page.total, "1");
        assert.equal(
          (await call("GET", `/items/${children}/${freeA}`)).data.parent_id,
          parent,
        );
        await call(
          "PATCH",
          `${path}/children`,
          { detach: [String(freeA)] },
          204,
        );
        assert.equal((await call("GET", choicesPath)).page.total, "2");
      },
    );

    await t.test(
      "O2M supports attach/create/unlink and prevents stealing another parent's child",
      async () => {
        await call(
          "PATCH",
          `${path}/children`,
          { attach: [String(child)] },
          204,
        );
        assert.equal(
          (await call("GET", `/items/${children}/${child}`)).data.parent_id,
          parent,
        );
        await call(
          "PATCH",
          `/items/${parents}/${other}/relations/children`,
          { attach: [String(child)] },
          409,
        );
        await call(
          "PATCH",
          `${path}/children`,
          { detach: [String(child)] },
          204,
        );
        assert.equal(
          (await call("GET", `/items/${children}/${child}`)).data.parent_id,
          null,
        );
        const created = await call(
          "POST",
          `${path}/children`,
          { title: "Linked child" },
          201,
        );
        assert.equal(
          (await call("GET", `/items/${children}/${created.data.id}`)).data
            .parent_id,
          parent,
        );
        await call(
          "POST",
          `${path}/children`,
          { title: "Wrong parent", parent_id: other },
          400,
        );
        const reader = limited([
          [`${parents}:read`, ["children"]],
          [`${children}:read`, ["title", "parent_id"]],
        ]);
        await assert.rejects(
          changeRelationItems(
            database,
            { ...address, field: "children" },
            { detach: [created.data.id] },
            reader,
            mutation,
          ),
          { statusCode: 403 },
        );
        await call("PATCH", `/collections/${children}/fields/parent_id`, {
          required: true,
          nullable: true,
        });
        const view = await call("GET", `${path}/children`);
        assert.equal(view.abilities.detach, false);
        await call(
          "PATCH",
          `${path}/children`,
          { detach: [created.data.id] },
          403,
        );
      },
    );

    await t.test("removing a display field resets its metadata", async () => {
      await call("DELETE", `/collections/${tags}/fields/label`, undefined, 204);
      const metadata = await database("asmblyr_collections")
        .where({ name: tags })
        .first("display_field");
      assert.equal(metadata.display_field, null);
      await call("GET", "/ready");
    });
  } finally {
    for (const name of names)
      await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").whereIn("name", names).delete();
    await app.close();
    await database.destroy();
  }
});
