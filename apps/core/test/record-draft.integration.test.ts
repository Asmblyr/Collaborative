import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";
import { commitRecordDraft } from "../src/items/record-draft.js";
import { parseRecordDraft } from "../src/items/record-draft-input.js";
import { resolveRecordLabels } from "../src/items/record-labels.js";
import type { Access } from "../src/permissions/access.js";

test("draft input limits nesting, operations and unexpected keys", () => {
  assert.throws(() => parseRecordDraft({ values: {}, unexpected: true }));
  assert.throws(() => parseRecordDraft({ values: {}, records: [{ collection: "x", record: { values: {} } }] }));
  assert.throws(() => parseRecordDraft({ relations: { children: { create: [{ record: { id: "1", values: {} } }] } } }));
  assert.throws(() => parseRecordDraft({ relations: { tags: { create: [{ record: { values: {} }, link: { id: "1", values: {} } }] } } }));
  assert.throws(() => parseRecordDraft({ relations: { tags: { links: [{ id: "1", record: { id: "2", values: {} } }] } } }));
  assert.doesNotThrow(() => parseRecordDraft({ relations: { children: { detach: Array(100).fill("1") } } }));
  assert.throws(() => parseRecordDraft({ relations: { children: { detach: Array(100).fill("1"), attach: [{ id: "2" }] } } }));
  let deep: object = { values: {} };
  for (let i = 0; i < 7; i++) deep = { values: {}, references: { parent: deep } };
  assert.throws(() => parseRecordDraft(deep));
});

test("record draft saves fields and nested relationships atomically with existing grants", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const user = await authorizeTestApp(app, database);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const parents = `test_draft_parents_${suffix}`, children = `test_draft_children_${suffix}`;
  const tags = `test_draft_tags_${suffix}`, bridge = `test_draft_links_${suffix}`;
  const names = [bridge, children, parents, tags];
  const limited = (grants: [string, string[]][], superuser = false): Access => ({
    principal: { kind: "user", id: user.id, email: "draft@example.test", superuser, sessionId: "test" }, grants: new Map(grants),
  });
  const admin = limited([], true);
  const context = () => ({ requestId: randomUUID(), actor: { kind: "user" as const, id: user.id } });
  async function call(method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, status = 200) {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, status, response.body);
    return response.json();
  }
  const create = async (name: string, values: object) => String((await call("POST", `/items/${name}`, values, 201)).data.id);
  try {
    for (const name of [tags, parents, children]) await call("POST", "/collections", {
      name, primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "title", type: "text" }, { name: "secret", type: "text" }],
    }, 201);
    await call("POST", `/collections/${children}/relations`, { kind: "m2o", name: "parent_id",
      targetCollection: parents, reverseField: "children", nullable: true, onDelete: "setNull" }, 201);
    for (const name of [parents, children]) await call("POST", `/collections/${name}/relations`, {
      kind: "m2o", name: "category_id", targetCollection: tags, nullable: true, onDelete: "setNull",
    }, 201);
    await call("POST", `/collections/${parents}/relations`, { kind: "m2m", name: "tags", targetCollection: tags,
      junctionCollection: bridge, sourceKey: "parent_id", targetKey: "tag_id" }, 201);
    await call("POST", `/collections/${bridge}/fields`, { name: "note", type: "text", nullable: true }, 201);
    await call("POST", `/collections/${bridge}/relations`, { kind: "m2o", name: "category_id",
      targetCollection: tags, nullable: true, onDelete: "setNull" }, 201);
    const parent = await create(parents, { title: "Before" });
    const other = await create(parents, { title: "Other" });
    const free = await create(children, { title: "Free" });
    const linked = await create(children, { title: "Linked", parent_id: parent });
    const occupied = await create(children, { title: "Occupied", parent_id: other });
    const tag = await create(tags, { title: "Existing category", secret: "Private name" });

    await t.test("one commit updates parent, creates reference and child, attaches, detaches and writes junction attributes", async () => {
      const mutation = context();
      const result = await commitRecordDraft(database, parents, { id: parent, values: { title: "After" },
        references: { category_id: { values: { title: "New reference" } } },
        relations: {
          children: { attach: [{ id: free }], detach: [linked],
            create: [{ record: { values: { title: "New child", category_id: tag } } }] },
          tags: { attach: [{ id: tag, record: { values: { note: "Link note" },
            references: { category_id: { values: { title: "Link reference" } } } } }],
            create: [{ record: { values: { title: "New tag" } }, link: { values: { note: "New link" } } }] },
        },
      }, admin, mutation);
      assert.equal(result.id, parent);
      assert.equal((await database(parents).where({ id: parent }).first()).title, "After");
      assert.equal(String((await database(children).where({ id: free }).first()).parent_id), parent);
      assert.equal((await database(children).where({ id: linked }).first()).parent_id, null);
      assert.equal(String((await database(children).where({ title: "New child" }).first()).parent_id), parent);
      const link = await database(bridge).where({ parent_id: parent, tag_id: tag }).first();
      assert.equal(link.note, "Link note");
      assert.equal((await database(tags).where({ id: link.category_id }).first()).title, "Link reference");
      const events = await database("asmblyr_item_events").where({ request_id: mutation.requestId });
      assert.ok(events.length >= 8);
      assert.ok(events.every((event) => event.actor_id === user.id));
    });

    await t.test("conflict rolls back preceding fields, rows and audit events", async () => {
      const mutation = context();
      const count = await database(tags).count("* as total").first();
      await assert.rejects(commitRecordDraft(database, parents, { id: parent, values: { title: "Must roll back" },
        references: { category_id: { values: { title: "Must not exist" } } },
        relations: { children: { attach: [{ id: occupied }] } },
      }, admin, mutation), { statusCode: 409, code: "RELATION_PARENT_CONFLICT" });
      assert.equal((await database(parents).where({ id: parent }).first()).title, "After");
      assert.deepEqual(await database(tags).count("* as total").first(), count);
      assert.equal((await database("asmblyr_item_events").where({ request_id: mutation.requestId })).length, 0);
    });

    await t.test("nested field grants, auto parent and link ownership cannot be bypassed", async () => {
      const writer = limited([[`${parents}:read`, ["*"]], [`${parents}:update`, ["title"]],
        [`${tags}:read`, ["*"]], [`${tags}:update`, ["title"]]]);
      await assert.rejects(commitRecordDraft(database, parents, { id: parent, values: { title: "Denied" },
        records: [{ collection: tags, record: { id: tag, values: { secret: "Denied" } } }],
      }, writer, context()), { statusCode: 403 });
      assert.equal((await database(parents).where({ id: parent }).first()).title, "After");
      await assert.rejects(commitRecordDraft(database, parents, { id: parent, values: {},
        relations: { children: { create: [{ record: { values: { title: "Wrong", parent_id: other } } }] } },
      }, admin, context()), { statusCode: 400 });
      const foreignLink = await create(bridge, { parent_id: other, tag_id: tag });
      await assert.rejects(commitRecordDraft(database, parents, { id: parent, values: {},
        relations: { tags: { links: [{ id: foreignLink, record: { values: { note: "Denied" } } }] } },
      }, admin, context()), { statusCode: 404 });
    });

    await t.test("relation-only changes work with readonly parent and same M2O edits need no FK write", async () => {
      const writer = limited([[`${parents}:read`, ["children"]], [`${children}:read`, ["*"]], [`${children}:update`, ["parent_id"]]]);
      await commitRecordDraft(database, parents, { id: parent, values: {}, relations: { children: { attach: [{ id: linked }] } } }, writer, context());
      const record = await database(parents).where({ id: parent }).first();
      const referenceWriter = limited([[`${parents}:read`, ["category_id"]], [`${tags}:read`, ["title"]], [`${tags}:update`, ["title"]]]);
      await commitRecordDraft(database, parents, { id: parent, values: {}, references: {
        category_id: { id: String(record.category_id), values: { title: "Edited reference" } },
      } }, referenceWriter, context());
      assert.equal((await database(tags).where({ id: record.category_id }).first()).title, "Edited reference");
    });

    await t.test("create-only root, HTTP contract and scoped link update", async () => {
      const result = await commitRecordDraft(database, parents, { values: { title: "Create only" } },
        limited([[`${parents}:create`, ["title"]]]), context());
      assert.equal((await database(parents).where({ id: result.id }).first()).title, "Create only");
      const response = await call("POST", `/items/${parents}/commit`, { values: { title: "HTTP draft" },
        relations: { children: { create: [{ record: { values: { title: "HTTP child" } } }] } } });
      assert.equal(String((await database(children).where({ title: "HTTP child" }).first()).parent_id), response.data.id);
      const link = await database(bridge).where({ parent_id: parent, tag_id: tag }).first();
      await call("POST", `/items/${parents}/commit`, { id: parent, values: {}, relations: { tags: { links: [{ id: String(link.id),
        record: { id: String(link.id), values: { note: "Updated" }, references: { category_id: { id: String(link.category_id), values: { title: "Updated link ref" } } } } }] } } });
      assert.equal((await database(bridge).where({ id: link.id }).first()).note, "Updated");
      assert.equal((await database(tags).where({ id: link.category_id }).first()).title, "Updated link ref");
    });

    await t.test("canonical labels expand one readable reference without exposing private fields", async () => {
      await call("PUT", `/collections/${children}/relations/category_id/search`, { searchable: true });
      const child = await create(children, { category_id: tag });
      assert.equal((await call("GET", `/items/${children}/${child}`)).label, "Existing category");
      assert.equal((await call("GET", `/items/${children}`)).labels[child], "Existing category");
      const noTarget = limited([[`${children}:read`, ["title", "category_id"]]]);
      assert.equal((await resolveRecordLabels(database, children, [child], noTarget))[child], child);
      await call("PUT", `/collections/${tags}/display`, { displayField: "secret" });
      const hidden = limited([[`${children}:read`, ["title", "category_id"]], [`${tags}:read`, ["title"]]]);
      assert.equal((await resolveRecordLabels(database, children, [child], hidden))[child], child);
      assert.equal((await resolveRecordLabels(database, children, [child], admin))[child], "Private name");
      await call("PUT", `/collections/${children}/display`, { displayField: "secret" });
      assert.equal((await resolveRecordLabels(database, children, [child], hidden))[child], child);
    });
  } finally {
    for (const name of names) await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").whereIn("name", names).delete();
    await app.close(); await database.destroy();
  }
});
