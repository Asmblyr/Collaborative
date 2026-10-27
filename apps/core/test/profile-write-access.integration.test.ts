import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { systemCollectionFixture } from "./support/system-collections.js";

test("profile mutations require explicit rights while personal security, appearance and apps remain available", async (t) => {
  const { call, app, member, db } = await systemCollectionFixture(t);
  const before = await call("GET", "/users/me", undefined, 200, 1);
  const form = await call("GET", "/users/me/form", undefined, 200, 1);
  assert.equal(form.canEditAvatar, true);
  for (const field of ["firstName", "lastName", "displayName", "description"]) {
    assert.ok(form.readOnlyFields.includes(field));
    await call("PATCH", "/users/me", { [field]: "Blocked" }, 403, 1);
    await call(
      "PATCH",
      "/users/me/form",
      { values: { [field]: "Blocked" } },
      403,
      1,
    );
  }
  for (const payload of [
    { avatarId: null },
    { pictureUrl: "https://example.test/avatar.png" },
  ]) {
    await call("PATCH", "/users/me", payload, 200, 1);
  }
  await call("PATCH", "/users/me", { pictureUrl: null }, 200, 1);
  await call("PATCH", "/users/me/form", { values: {}, avatarId: null }, 200, 1);
  await call(
    "PATCH",
    `/users/${member.id}/profile`,
    { firstName: "Bypass" },
    403,
    1,
  );
  await call(
    "PATCH",
    `/users/${member.id}/form`,
    { values: { firstName: "Bypass" } },
    403,
    1,
  );
  const { issueUserTokens } = await import("../src/auth/tokens.js");
  const token = await issueUserTokens(db, member.id);
  const denied = await app.inject({
    method: "POST",
    url: "/users/me/avatar",
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      "content-type": "application/octet-stream",
    },
    payload: Buffer.from("not an upload"),
  });
  assert.equal(denied.statusCode, 400);
  await call("GET", "/users/me/sessions", undefined, 200, 1);
  await call("PATCH", "/users/me/preferences", { theme: "dark" }, 200, 1);
  await call("GET", "/users/me/oauth-apps", undefined, 200, 1);
  const after = await call("GET", "/users/me", undefined, 200, 1);
  for (const field of [
    "firstName",
    "lastName",
    "displayName",
    "description",
    "avatarId",
    "pictureUrl",
  ]) {
    assert.equal(after[field], before[field]);
  }
});

test("individual owner grants cover legacy and unified writes and are revoked without losing values", async (t) => {
  const { call, member, db } = await systemCollectionFixture(t);
  await call("PUT", "/system-collections/users/form", {
    layout: null,
    selfAccess: { firstName: "write" },
  });
  const form = await call("GET", "/users/me/form", undefined, 200, 1);
  assert.ok(!form.readOnlyFields.includes("firstName"));
  assert.ok(form.readOnlyFields.includes("lastName"));
  assert.equal(form.canEditAvatar, true);
  await call("PATCH", "/users/me", { firstName: "Granted" }, 200, 1);
  await call(
    "PATCH",
    "/users/me/form",
    { values: { firstName: "Updated" } },
    200,
    1,
  );
  await call(
    "PATCH",
    "/users/me/form",
    { values: { firstName: "Must roll back", description: "Denied" } },
    403,
    1,
  );
  await call(
    "PATCH",
    "/users/me",
    { pictureUrl: "https://example.test/a.png" },
    200,
    1,
  );
  assert.equal(
    (await db("public.asmblyr_users").where({ id: member.id }).first())
      .first_name,
    "Updated",
  );
  await call("PUT", "/system-collections/users/form", {
    layout: null,
    selfAccess: {},
  });
  assert.equal(
    (await call("GET", "/users/me/form", undefined, 200, 1)).canEditAvatar,
    true,
  );
  await call("PATCH", "/users/me", { avatarId: null }, 200, 1);
  await call("PUT", "/system-collections/users/form", {
    layout: null,
    selfAccess: {},
  });
  await call("PATCH", "/users/me", { firstName: "Revoked" }, 403, 1);
  assert.equal(
    (await call("GET", "/users/me", undefined, 200, 1)).firstName,
    "Updated",
  );
});

test("existing users-update authority permits native profile management and revocation is immediate", async (t) => {
  const { call, member, admin } = await systemCollectionFixture(t);
  const policy = await call(
    "POST",
    "/policies",
    { name: "Profile managers" },
    201,
  );
  const permission = await call(
    "POST",
    "/permissions",
    { section: "users", action: "update", fields: ["*"] },
    201,
  );
  await call(
    "PUT",
    `/policies/${policy.id}/permissions/${permission.id}`,
    undefined,
    204,
  );
  await call(
    "PUT",
    `/policies/${policy.id}/users`,
    { userIds: [member.id] },
    204,
  );
  await call("PATCH", "/users/me", { firstName: "Manager" }, 200, 1);
  await call(
    "PATCH",
    `/users/${admin.id}/profile`,
    { description: "Managed" },
    200,
    1,
  );
  await call("PUT", `/policies/${policy.id}/users`, { userIds: [] }, 204);
  await call("PATCH", "/users/me", { firstName: "Revoked" }, 403, 1);
  await call(
    "PATCH",
    `/users/${admin.id}/profile`,
    { description: "Denied" },
    403,
    1,
  );
});
