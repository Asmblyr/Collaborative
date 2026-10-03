import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { pluginWritesFixture } from "./support/plugin-writes-fixture.js";

test("HTTP SDK and kit enforce write grants, project results and audit the real caller", async (t) => {
  const f = await pluginWritesFixture();
  t.after(f.close);
  for (const action of ["create", "update", "delete"] as const) {
    const fields = action === "delete" ? ["*"] : ["title"];
    await f.grant(f.collection, fields, f.member.id, action);
  }
  for (const [name, items] of [
    ["HTTP", f.http(f.memberToken)],
    ["kit", f.kit(f.memberToken)],
  ] as const) {
    const created = await items.create(f.collection, {
      title: `${name} before`,
    });
    assert.ok(created.data);
    const id = String(created.data.id);
    assert.deepEqual(created.data, { id: Number(id), title: `${name} before` });
    await assert.rejects(
      items.update(f.collection, id, { secret: "Forbidden" }),
      { status: 403 },
    );
    await assert.rejects(items.create(f.collection, { secret: "Forbidden" }), {
      status: 403,
    });
    await assert.rejects(items.update(f.collection, id, { title: 42 }), {
      status: 400,
    });
    await assert.rejects(items.update(f.collection, id, {}), { status: 400 });
    const updated = await items.update(f.collection, id, {
      title: `${name} after`,
    });
    assert.deepEqual(updated.data, { id: Number(id), title: `${name} after` });
    await items.update(f.collection, id, { title: `${name} after` }); // No-op has no audit event.
    assert.equal(await items.delete(f.collection, id), undefined);
    await assert.rejects(items.delete(f.collection, id), { status: 404 });
    const events = await f
      .db("asmblyr_item_events")
      .where({ collection_name: f.collection, item_id: id })
      .orderBy("id");
    assert.deepEqual(
      events.map((event) => event.action),
      ["create", "update", "delete"],
    );
    assert.ok(
      events.every(
        (event) =>
          event.actor_id === f.member.id && event.actor_kind === "user",
      ),
    );
    assert.deepEqual(events[1].before.title, `${name} before`);
    assert.deepEqual(events[1].after.title, `${name} after`);
    assert.equal(new Set(events.map((event) => event.request_id)).size, 3);
  }
  for (const items of [f.http(f.outsiderToken), f.kit(f.outsiderToken)]) {
    await assert.rejects(items.create(f.collection, { title: "Denied" }), {
      status: 403,
    });
    await assert.rejects(items.delete(f.collection, 1), { status: 403 });
  }
  await f
    .db("asmblyr_auth_sessions")
    .where({ user_id: f.member.id })
    .update({ revoked_at: f.db.fn.now() });
  for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
    await assert.rejects(items.create(f.collection, { title: "Revoked" }), {
      status: 401,
    });
  }
});

test("create and update without read permission succeed with data:null", async (t) => {
  const f = await pluginWritesFixture();
  t.after(f.close);
  for (const action of ["create", "update"] as const) {
    await f.grant(f.collection, ["title"], f.outsider.id, action);
  }
  for (const [name, items] of [
    ["HTTP", f.http(f.outsiderToken)],
    ["kit", f.kit(f.outsiderToken)],
  ] as const) {
    assert.deepEqual(await items.create(f.collection, { title: name }), {
      data: null,
    });
    const row = await f.db(f.collection).where({ title: name }).first();
    assert.ok(row);
    assert.deepEqual(
      await items.update(f.collection, row.id, { title: `${name} updated` }),
      {
        data: null,
      },
    );
    assert.equal(
      (await f.db(f.collection).where({ id: row.id }).first()).title,
      `${name} updated`,
    );
  }
});

test("relation checks and atomic commits behave equally through SDK and kit", async (t) => {
  const f = await pluginWritesFixture();
  t.after(f.close);
  const target = `${f.collection}_category`;
  await f.call(
    "POST",
    "/collections",
    {
      name: target,
      primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "title", type: "text" }],
    },
    201,
  );
  await f.call(
    "POST",
    `/collections/${f.collection}/relations`,
    {
      kind: "m2o",
      name: "category_id",
      targetCollection: target,
      nullable: true,
      onDelete: "restrict",
    },
    201,
  );
  const category = (
    await f.call("POST", `/items/${target}`, { title: "Category" }, 201)
  ).data.id;
  for (const action of ["create", "update"] as const) {
    await f.grant(f.collection, ["title", "category_id"], f.member.id, action);
  }
  for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
    await assert.rejects(
      items.create(f.collection, { title: "Denied", category_id: category }),
      {
        status: 403,
      },
    );
    await assert.rejects(
      items.update(f.collection, 1, { category_id: category }),
      { status: 403 },
    );
  }
  await f.grant(target, ["title"]);
  await f.grant(target, ["title"], f.member.id, "create");
  await f.grant(f.collection, ["category_id"]);
  for (const items of [f.http(f.memberToken), f.kit(f.memberToken)]) {
    await assert.rejects(items.create(f.collection, { category_id: 99999 }), {
      status: 409,
    });
    await items.update(f.collection, 1, { category_id: category });
    const committed = await items.commit(f.collection, {
      values: { title: "With category" },
      references: { category_id: { values: { title: "Nested" } } },
    });
    const row = await f
      .db(f.collection)
      .where({ id: committed.data.id })
      .first();
    assert.equal(
      (await f.db(target).where({ id: row.category_id }).first()).title,
      "Nested",
    );
    const count = await f.db(target).count("* as total").first();
    const events = await f
      .db("asmblyr_item_events")
      .count("* as total")
      .first();
    await assert.rejects(
      items.commit(f.collection, {
        id: committed.data.id,
        values: { title: "Must roll back" },
        references: { category_id: { values: { title: "Must not persist" } } },
        records: [
          {
            collection: f.collection,
            record: { id: "99999", values: { title: "Missing" } },
          },
        ],
      }),
      { status: 404 },
    );
    assert.equal(
      (await f.db(f.collection).where({ id: committed.data.id }).first()).title,
      "With category",
    );
    assert.deepEqual(await f.db(target).count("* as total").first(), count);
    assert.deepEqual(
      await f.db("asmblyr_item_events").count("* as total").first(),
      events,
    );
  }
  await assert.rejects(f.http(f.adminToken).delete(target, category), {
    status: 409,
  });
  await assert.rejects(f.kit(f.adminToken).delete(target, category), {
    status: 409,
  });
});

test("service writes retain service identity and react to policy and key revocation", async (t) => {
  const f = await pluginWritesFixture();
  t.after(f.close);
  const policyIds = [f.policyId];
  for (const action of ["create", "update", "delete"] as const) {
    const fields = action === "delete" ? ["*"] : ["title"];
    policyIds.push(
      (await f.grant(f.collection, fields, f.member.id, action)).policyId,
    );
  }
  const service = (
    await f.call("POST", "/service-accounts", { name: "SDK writer" }, 201)
  ).data;
  await f.call("PUT", `/service-accounts/${service.id}`, {
    name: "SDK writer",
    policyIds,
  });
  const key = (
    await f.call(
      "POST",
      `/service-accounts/${service.id}/keys`,
      { name: "Writer test" },
      201,
    )
  ).data;
  const { accessToken } = await f.call(
    "POST",
    "/auth/service-token",
    { key: key.secret },
    200,
    null,
  );
  const row = (
    await f.http(accessToken).create(f.collection, { title: "Service" })
  ).data!;
  await f
    .kit(accessToken)
    .update(f.collection, String(row.id), { title: "Service updated" });
  const events = await f
    .db("asmblyr_item_events")
    .where({ collection_name: f.collection, item_id: String(row.id) });
  assert.equal(events.length, 2);
  assert.ok(
    events.every(
      (event) =>
        event.actor_kind === "service" && event.actor_id === service.id,
    ),
  );
  await f.call("PUT", `/service-accounts/${service.id}`, {
    name: "SDK writer",
    policyIds: [],
  });
  for (const items of [f.http(accessToken), f.kit(accessToken)]) {
    await assert.rejects(items.delete(f.collection, String(row.id)), {
      status: 403,
    });
  }
  await f.call(
    "DELETE",
    `/service-accounts/${service.id}/keys/${key.id}`,
    undefined,
    204,
  );
  for (const items of [f.http(accessToken), f.kit(accessToken)]) {
    await assert.rejects(items.create(f.collection, { title: "Revoked" }), {
      status: 401,
    });
  }
});
