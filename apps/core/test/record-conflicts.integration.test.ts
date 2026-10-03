import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { pluginWritesFixture } from "./support/plugin-writes-fixture.js";

test("atomic drafts protect original field values through HTTP SDK and Kit", async (t) => {
  const f = await pluginWritesFixture();
  t.after(f.close);
  const admin = f.http(f.adminToken);
  await f.grant(f.collection, ["title"], f.member.id, "update");
  async function create(values = { title: "Original", secret: "Private" }) {
    const result = await admin.create(f.collection, values);
    return String(result.data!.id);
  }

  await t.test(
    "stale clients cannot overwrite a field, even after an ordinary PATCH",
    async () => {
      for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
        const id = await create();
        await admin.update(f.collection, id, { title: "Colleague" });
        const count = await f
          .db("asmblyr_item_events")
          .where({ collection_name: f.collection, item_id: id })
          .count("*")
          .first();
        await assert.rejects(
          items.commit(f.collection, {
            id,
            values: { title: "Mine" },
            expectedValues: { title: "Original" },
          }),
          { status: 409, code: "ITEM_CHANGED" },
        );
        assert.equal(
          (await f.db(f.collection).where({ id }).first()).title,
          "Colleague",
        );
        assert.deepEqual(
          await f
            .db("asmblyr_item_events")
            .where({ collection_name: f.collection, item_id: id })
            .count("*")
            .first(),
          count,
        );
        await items.commit(f.collection, {
          id,
          values: { title: "Mine" },
          expectedValues: { title: "Colleague" },
        });
        assert.equal(
          (await f.db(f.collection).where({ id }).first()).title,
          "Mine",
        );
      }
    },
  );

  await t.test(
    "different fields merge and a value already applied is an idempotent success",
    async () => {
      const id = await create();
      await admin.commit(f.collection, {
        id,
        values: { title: "Colleague" },
        expectedValues: { title: "Original" },
      });
      await admin.commit(f.collection, {
        id,
        values: { secret: "Changed separately" },
        expectedValues: { secret: "Private" },
      });
      await admin.commit(f.collection, {
        id,
        values: { title: "Colleague" },
        expectedValues: { title: "Original" },
      });
      const row = await f.db(f.collection).where({ id }).first();
      assert.equal(row.title, "Colleague");
      assert.equal(row.secret, "Changed separately");
    },
  );

  await t.test(
    "two simultaneous writes to one field have exactly one winner",
    async () => {
      const id = await create();
      const results = await Promise.allSettled(
        ["First", "Second"].map((title) =>
          admin.commit(f.collection, {
            id,
            values: { title },
            expectedValues: { title: "Original" },
          }),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(
        rejected?.status === "rejected" && rejected.reason.code,
        "ITEM_CHANGED",
      );
    },
  );

  await t.test(
    "a nested conflict rolls back the new root and all audit events",
    async () => {
      const id = await create();
      await admin.update(f.collection, id, { title: "Colleague" });
      const count = await f.db("asmblyr_item_events").count("*").first();
      await assert.rejects(
        admin.commit(f.collection, {
          values: { title: "Must roll back" },
          records: [
            {
              collection: f.collection,
              record: {
                id,
                values: { title: "Nested mine" },
                expectedValues: { title: "Original" },
              },
            },
          ],
        }),
        { status: 409, code: "ITEM_CHANGED" },
      );
      assert.equal(
        (await f.db(f.collection).where({ title: "Must roll back" })).length,
        0,
      );
      assert.deepEqual(
        await f.db("asmblyr_item_events").count("*").first(),
        count,
      );
    },
  );

  await t.test(
    "multiple edits to the same record in one draft compare its original snapshot",
    async () => {
      const name = `${f.collection}_uuid`;
      await f.call(
        "POST",
        "/collections",
        {
          name,
          primaryKey: { name: "id", type: "uuid" },
          fields: [{ name: "title", type: "text" }],
        },
        201,
      );
      const id = String(
        (await admin.create(name, { title: "Original" })).data!.id,
      );
      await admin.commit(name, {
        id,
        values: { title: "First" },
        expectedValues: { title: "Original" },
        records: [
          {
            collection: name,
            record: {
              id: id.toUpperCase(),
              values: { title: "Second" },
              expectedValues: { title: "Original" },
            },
          },
        ],
      });
      assert.equal((await f.db(name).where({ id }).first()).title, "Second");
    },
  );

  await t.test(
    "preconditions cannot probe write-only fields or bypass missing write grants",
    async () => {
      const id = await create();
      await f.grant(f.collection, ["secret"], f.member.id, "update");
      for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
        for (const secret of ["Private", "Wrong guess"]) {
          await assert.rejects(
            items.commit(f.collection, {
              id,
              values: { secret: "Private" },
              expectedValues: { secret },
            }),
            { status: 403 },
          );
        }
        await assert.rejects(
          items.commit(f.collection, {
            id,
            values: { title: "Changed" },
            expectedValues: {},
          }),
          { status: 400 },
        );
        await assert.rejects(
          f.http(f.outsiderToken).commit(f.collection, {
            id,
            values: { title: "Changed" },
            expectedValues: { title: "Original" },
          }),
          { status: 403 },
        );
      }
    },
  );

  await t.test(
    "structured values and HTTP dates work without updated_at",
    async () => {
      const name = `${f.collection}_plain`;
      await f.call(
        "POST",
        "/collections",
        {
          name,
          primaryKey: { name: "id", type: "serial" },
          timestamps: { createdAt: false, updatedAt: false },
          fields: [
            { name: "details", type: "json" },
            { name: "date", type: "datetime" },
          ],
        },
        201,
      );
      const result = await admin.create(name, {
        details: { a: 1, b: [2] },
        date: "2026-10-03T00:00:00.000Z",
      });
      const id = String(result.data!.id);
      const initial = (await admin.get(name, id)).data;
      assert.equal(Object.hasOwn(initial, "updated_at"), false);
      await admin.commit(name, {
        id,
        values: { details: { a: 2 }, date: "2026-10-04T00:00:00.000Z" },
        expectedValues: { details: { b: [2], a: 1 }, date: initial.date },
      });
      // Direct SQL is also detected because the precondition reads the actual row.
      await f
        .db(name)
        .where({ id })
        .update({ details: { external: true } });
      await assert.rejects(
        admin.commit(name, {
          id,
          values: { details: { a: 3 } },
          expectedValues: { details: { a: 2 } },
        }),
        { status: 409, code: "ITEM_CHANGED" },
      );
    },
  );

  await t.test(
    "changed foreign keys prevent creating and assigning an outdated reference",
    async () => {
      const name = `${f.collection}_refs`;
      await f.call(
        "POST",
        "/collections",
        { name, fields: [{ name: "title", type: "text" }] },
        201,
      );
      await f.call(
        "POST",
        `/collections/${f.collection}/relations`,
        {
          kind: "m2o",
          name: "category_id",
          targetCollection: name,
          nullable: true,
          onDelete: "restrict",
        },
        201,
      );
      const id = await create();
      const category = (
        await admin.create(name, { title: "Colleague category" })
      ).data!;
      await admin.update(f.collection, id, {
        category_id: String(category.id),
      });
      await assert.rejects(
        admin.commit(f.collection, {
          id,
          values: {},
          expectedValues: { category_id: null },
          references: { category_id: { values: { title: "Must roll back" } } },
        }),
        { status: 409, code: "ITEM_CHANGED" },
      );
      assert.equal(
        (await f.db(name).where({ title: "Must roll back" })).length,
        0,
      );
      assert.equal(
        String((await f.db(f.collection).where({ id }).first()).category_id),
        String(category.id),
      );
    },
  );

  await t.test(
    "junction attributes participate in the same atomic conflict check",
    async () => {
      const target = `${f.collection}_tags`,
        bridge = `${f.collection}_links`;
      await f.call(
        "POST",
        "/collections",
        { name: target, fields: [{ name: "title", type: "text" }] },
        201,
      );
      await f.call(
        "POST",
        `/collections/${f.collection}/relations`,
        {
          kind: "m2m",
          name: "tags",
          targetCollection: target,
          junctionCollection: bridge,
          sourceKey: "parent_id",
          targetKey: "tag_id",
        },
        201,
      );
      await f.call(
        "POST",
        `/collections/${bridge}/fields`,
        { name: "note", type: "text", nullable: true },
        201,
      );
      const id = await create();
      const tag = String(
        (await admin.create(target, { title: "Tag" })).data!.id,
      );
      await admin.commit(f.collection, {
        id,
        values: {},
        relations: {
          tags: {
            attach: [{ id: tag, record: { values: { note: "Original" } } }],
          },
        },
      });
      const link = await f
        .db(bridge)
        .where({ parent_id: id, tag_id: tag })
        .first();
      await f.db(bridge).where({ id: link.id }).update({ note: "Colleague" });
      await assert.rejects(
        admin.commit(f.collection, {
          id,
          values: { title: "Must roll back" },
          expectedValues: { title: "Original" },
          relations: {
            tags: {
              links: [
                {
                  id: String(link.id),
                  record: {
                    id: String(link.id),
                    values: { note: "Mine" },
                    expectedValues: { note: "Original" },
                  },
                },
              ],
            },
          },
        }),
        { status: 409, code: "ITEM_CHANGED" },
      );
      assert.equal(
        (await f.db(f.collection).where({ id }).first()).title,
        "Original",
      );
      assert.equal(
        (await f.db(bridge).where({ id: link.id }).first()).note,
        "Colleague",
      );
    },
  );

  await t.test(
    "conditional read grants cannot reveal a hidden field through a precondition",
    async () => {
      const id = await create();
      const permission = await f.grant(f.collection, ["secret"]);
      await f.call("PATCH", `/permissions/${permission.permissionId}`, {
        fields: ["secret"],
        rowFilter: {
          logic: "and",
          children: [
            {
              field: "title",
              op: "eq",
              value: { kind: "literal", value: "Other record" },
            },
          ],
        },
      });
      for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
        for (const secret of ["Private", "Wrong guess"]) {
          await assert.rejects(
            items.commit(f.collection, {
              id,
              values: { secret: "Private" },
              expectedValues: { secret },
            }),
            { status: 403 },
          );
        }
      }
      assert.equal(
        (await f.db(f.collection).where({ id }).first()).secret,
        "Private",
      );
    },
  );
});
