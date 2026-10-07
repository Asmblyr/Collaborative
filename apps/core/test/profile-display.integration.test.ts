import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { systemCollectionFixture } from "./support/system-collections.js";

test("profile display discloses only explicitly configured rooted values without granting directory access", async (t) => {
  const { db, call, create, admin, member, fieldPath } =
    await systemCollectionFixture(t);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const collection = `display_groups_${suffix}`;
  const root = `display_group_${suffix}`;
  const note = `display_note_${suffix}`;
  const before = await db("asmblyr_users")
    .where({ id: member.id })
    .first("id", "email", "status", "superuser");
  await call(
    "POST",
    "/collections",
    {
      name: collection,
      fields: [
        { name: "name", type: "text" },
        { name: "private", type: "text" },
      ],
    },
    201,
  );
  await call(
    "POST",
    `/collections/${collection}/relations`,
    { name: "owner", targetCollection: "@users", onDelete: "setNull" },
    201,
  );
  await db("asmblyr_users")
    .where({ id: admin.id })
    .update({ display_name: "Alex Manager" });
  const group = await call(
    "POST",
    `/items/${collection}`,
    { name: "Engineering", private: "Must not escape", owner: admin.id },
    201,
  );
  await create("users", root, "relation", { targetCollection: collection });
  await create("users", note);
  await call("PUT", `/collections/${collection}/fields/private/presentation`, {
    sensitive: true,
  });
  await call("PATCH", `/system-collections/users/records/${member.id}`, {
    values: {
      [root]: group.id,
      [note]: "Admin-only note",
    },
  });
  const entries = [
    { id: "group", label: "Team", path: [root, "name"], selfVisible: true },
    { id: "lead", label: "Lead", path: [root, "owner"], selfVisible: true },
    { id: "note", label: "Internal", path: [note], selfVisible: false },
  ];
  const config = { title: "Organization", entries };
  await call("PUT", "/users/profile-display", config);

  const own = await call("GET", "/users/me/profile-display", undefined, 200, 1);
  assert.deepEqual(own, {
    title: "Organization",
    entries: [
      { id: "group", label: "Team", type: "text", value: "Engineering" },
      { id: "lead", label: "Lead", type: "user", value: "Alex Manager" },
    ],
  });
  assert.equal(JSON.stringify(own).includes("Must not escape"), false);
  await call("GET", `/items/${collection}`, undefined, 403, 1);
  await call("GET", "/users/references", undefined, 403, 1);
  await call("GET", `/users/${admin.id}/profile-display`, undefined, 403, 1);
  await call("GET", "/users/profile-display", undefined, 403, 1);
  await call("GET", "/users/profile-display/sources", undefined, 403, 1);
  await call("PUT", "/users/profile-display", config, 403, 1);
  await call("GET", "/users/me/profile-display", undefined, 401, -1);
  await call("PATCH", "/users/me/profile-display", { value: "escape" }, 404, 1);
  const other = await call("GET", `/users/${member.id}/profile-display`);
  assert.equal(other.entries[2].value, "Admin-only note");

  const sources = await call("GET", "/users/profile-display/sources");
  assert.ok(sources.some((entry: { name: string }) => entry.name === root));
  for (const hidden of ["email", "superuser", "password"]) {
    assert.equal(
      sources.some((entry: { name: string }) => entry.name === hidden),
      false,
    );
  }
  const invalid = [
    ["email"],
    [root, "private"],
    [root],
    [root, "owner", "email"],
    [root, "name", "private"],
    [root, "name", "x", "y"],
    ["bad;select"],
  ];
  for (const path of invalid) {
    await call(
      "PUT",
      "/users/profile-display",
      { ...config, entries: [{ ...entries[0], path }] },
      400,
    );
  }
  await call(
    "PUT",
    "/users/profile-display",
    { ...config, entries: [entries[0], entries[0]] },
    400,
  );
  assert.deepEqual(await call("GET", "/users/profile-display"), config);

  await db(collection).where({ id: group.id }).update({ name: "Platform" });
  await db("asmblyr_users")
    .where({ id: admin.id })
    .update({ display_name: "New Lead" });
  const live = await call(
    "GET",
    "/users/me/profile-display",
    undefined,
    200,
    1,
  );
  assert.equal(live.entries[0].value, "Platform");
  assert.equal(live.entries[1].value, "New Lead");

  // Same-name replacement is not the column the administrator approved.
  await call("DELETE", fieldPath("users", note), undefined, 204);
  await create("users", note);
  await call("PATCH", `/system-collections/users/records/${member.id}`, {
    values: { [note]: "Replacement secret" },
  });
  assert.equal(
    (await call("GET", `/users/${member.id}/profile-display`)).entries.length,
    2,
  );

  // Marking a configured field sensitive revokes its projection immediately.
  await call("PUT", `/collections/${collection}/fields/name/presentation`, {
    sensitive: true,
  });
  assert.equal(
    (await call("GET", "/users/me/profile-display", undefined, 200, 1)).entries
      .length,
    1,
  );
  await call("PATCH", `/system-collections/users/records/${member.id}`, {
    values: { [root]: null },
  });
  assert.equal(
    (await call("GET", "/users/me/profile-display", undefined, 200, 1))
      .entries[0].value,
    null,
  );
  assert.deepEqual(
    await db("asmblyr_users")
      .where({ id: member.id })
      .first("id", "email", "status", "superuser"),
    before,
  );
  await call("PUT", "/users/profile-display", { title: "", entries: [] });
  assert.deepEqual(
    await call("GET", "/users/me/profile-display", undefined, 200, 1),
    { title: "", entries: [] },
  );
  await call("DELETE", fieldPath("users", root), undefined, 204);
  await call("DELETE", fieldPath("users", note), undefined, 204);
  await call("DELETE", `/collections/${collection}`, undefined, 204);
});
