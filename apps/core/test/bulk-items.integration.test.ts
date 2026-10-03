import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { featureFixture } from "./support/feature-fixture.js";

test("bulk updates are atomic, field-protected and audited with one request identifier", async () => {
  const f = await featureFixture(), name = `${f.prefix}_bulk`; f.names.push(name);
  const { call, db, memberHeaders } = f;
  try {
    await call("POST", "/collections", { name, timestamps: { updatedAt: true }, fields: [
      { name: "title", type: "text", required: true }, { name: "secret", type: "text" },
    ] }, 201);
    const rows = await Promise.all(["First", "Second"].map((title) => call("POST", `/items/${name}`, { title, secret: "preserved" }, 201)));
    const ids = rows.map((r) => r.id);
    await call("PATCH", `/items/${name}`, { ids, values: { title: "Updated" } }, 403, memberHeaders);
    await f.grant(name, "update", ["title"]);
    await call("PATCH", `/items/${name}`, { ids, values: { secret: "denied" } }, 403, memberHeaders);
    for (const invalid of [[], [ids[0], ids[0]], Array(101).fill(ids[0])]) await call("PATCH", `/items/${name}`, { ids: invalid, values: { title: "x" } }, 400);
    await call("PATCH", `/items/${name}`, { ids: [ids[0], randomUUID()], values: { title: "rolled back" } }, 404);
    assert.equal((await call("GET", `/items/${name}/${ids[0]}`)).title, "First");
    await call("PATCH", `/items/${name}`, { ids, values: { title: null } }, 400);
    assert.deepEqual(await call("PATCH", `/items/${name}`, { ids: [...ids].reverse(), values: { title: "Updated" } }, 200, memberHeaders), { selected: 2, changed: 2 });
    const audit = await db("asmblyr_item_events").where({ collection_name: name, action: "update" }).orderBy("item_id");
    assert.equal(audit.length, 2); assert.equal(new Set(audit.map((e) => e.request_id)).size, 1);
    assert.ok(audit.every((e) => e.actor_id === f.member.id && e.after.title === "Updated" && !Object.hasOwn(e.after, "secret")));
    assert.ok((await db(name)).every((r) => r.secret === "preserved"));
    assert.deepEqual(await call("PATCH", `/items/${name}`, { ids, values: { title: "Updated" } }), { selected: 2, changed: 0 });
    assert.equal((await db("asmblyr_item_events").where({ collection_name: name, action: "update" })).length, 2);
  } finally { await f.close(); }
});
