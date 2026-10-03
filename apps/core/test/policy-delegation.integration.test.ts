import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { delegationFixture } from "./support/delegation-fixture.js";

test("only administrators change policy contents and delegation; managers assign the explicit live set", async (t) => {
  const f = await delegationFixture(t);
  const { call, userIds, ready, blocked, manager } = f;
  const before = (await call("GET", `/policies/${ready}`, 0)).json().data;
  const permissionId = before.permissions[0].id;
  assert.equal(
    (await call("GET", "/settings/access")).json().data.canManagePolicies,
    false,
  );
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.delegatablePolicyIds,
    [],
  );
  assert.equal(
    (await call("PUT", `/policies/${ready}/users/${userIds[2]}`)).statusCode,
    403,
  );
  await f.allow([ready]);
  for (const [method, url, payload] of [
    ["POST", "/policies", { name: "Escalate" }],
    [
      "PATCH",
      `/policies/${ready}`,
      {
        name: "Escalate",
        permissions: [{ section: "policies", action: "update", fields: ["*"] }],
        userIds: [],
      },
    ],
    ["DELETE", `/policies/${ready}`, undefined],
    [
      "POST",
      "/permissions",
      { section: "policies", action: "update", fields: ["*"] },
    ],
    ["PATCH", `/permissions/${permissionId}`, { fields: ["*"] }],
    ["DELETE", `/permissions/${permissionId}`, undefined],
    ["PUT", `/policies/${ready}/permissions/${permissionId}`, undefined],
    ["DELETE", `/policies/${ready}/permissions/${permissionId}`, undefined],
    ["PUT", `/users/${userIds[1]}/delegation`, { policyIds: [blocked] }],
    ["PUT", `/policies/${blocked}/users/${userIds[2]}`, undefined],
    ["DELETE", `/policies/${blocked}/users/${userIds[2]}`, undefined],
    ["PUT", `/policies/${ready}/users/${userIds[1]}`, undefined],
    ["PUT", `/policies/${ready}/users/${userIds[0]}`, undefined],
  ] as const) {
    const response = await call(method, url, 1, payload);
    assert.equal(
      response.statusCode,
      403,
      `${method} ${url}: ${response.body}`,
    );
  }
  assert.deepEqual(
    (await call("GET", `/policies/${ready}`, 0)).json().data,
    before,
  );
  assert.equal(
    (await call("PUT", `/policies/${ready}/users/${userIds[2]}`)).statusCode,
    204,
  );
  assert.equal(
    (await call("DELETE", `/policies/${ready}/users/${userIds[2]}`)).statusCode,
    204,
  );
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[2], userIds[3]],
      })
    ).statusCode,
    204,
  );
  assert.deepEqual(
    (await call("GET", `/policies/${ready}`, 0))
      .json()
      .data.users.map((user: { id: string }) => user.id)
      .sort(),
    [userIds[2], userIds[3]].sort(),
  );
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[1]],
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[2]],
        permissions: [],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[2], userIds[2]],
      })
    ).statusCode,
    400,
  );
  // Self assignments cannot be changed, but an existing one may be preserved.
  await call("PUT", `/policies/${ready}/users/${userIds[1]}`, 0);
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[1], userIds[2]],
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (await call("DELETE", `/policies/${ready}/users/${userIds[1]}`)).statusCode,
    403,
  );
  assert.equal(
    (
      await call("PUT", `/policies/${ready}/users`, 1, {
        userIds: [userIds[2]],
      })
    ).statusCode,
    403,
  );
  // Invalid administrator updates are atomic; a read grant cannot delegate.
  assert.equal(
    (
      await call("PUT", `/users/${userIds[1]}/delegation`, 0, {
        policyIds: [ready, randomUUID()],
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call("PUT", `/users/${userIds[1]}/delegation`, 0, {
        policyIds: [ready, ready],
      })
    ).statusCode,
    400,
  );
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.delegatablePolicyIds,
    [ready],
  );
  await f.policy(
    [{ section: "policies", action: "read", fields: ["*"] }],
    [userIds[3]],
  );
  await call("PUT", `/users/${userIds[3]}/delegation`, 0, {
    policyIds: [ready],
  });
  assert.equal(
    (await call("PUT", `/policies/${ready}/users/${userIds[2]}`, 3)).statusCode,
    403,
  );
  assert.equal(
    (
      await call("PUT", `/users/${userIds[3]}/delegation`, 3, {
        policyIds: [blocked],
      })
    ).statusCode,
    403,
  );
  await f.allow([]);
  assert.equal(
    (await call("PUT", `/policies/${ready}/users/${userIds[2]}`)).statusCode,
    403,
  );
  await f.allow([ready]);
  await call("DELETE", `/policies/${manager}/users/${userIds[1]}`, 0);
  assert.equal(
    (await call("PUT", `/policies/${ready}/users/${userIds[2]}`)).statusCode,
    403,
  );
});

test("renewing an invitation cannot acquire an account outside the delegated set", async (t) => {
  const f = await delegationFixture(t);
  await f.allow([f.ready]);
  const invitation = await f.call("POST", "/users", 0, {
    email: `${randomUUID()}@delegation.test`,
  });
  assert.equal(invitation.statusCode, 201, invitation.body);
  const id = invitation.json().data.user.id as string;
  f.userIds.push(id);
  await f.call("PUT", `/policies/${f.blocked}/users/${id}`, 0);
  const before = await f
    .db("public.asmblyr_user_invitations")
    .where({ user_id: id })
    .first();
  assert.equal(
    (await f.call("POST", `/users/${id}/invitation`, 1, {})).statusCode,
    403,
  );
  assert.deepEqual(
    await f
      .db("public.asmblyr_user_invitations")
      .where({ user_id: id })
      .first(),
    before,
  );
  await f.call("DELETE", `/policies/${f.blocked}/users/${id}`, 0);
  await f.call("PUT", `/policies/${f.ready}/users/${id}`, 0);
  assert.equal(
    (await f.call("POST", `/users/${id}/invitation`, 1, {})).statusCode,
    200,
  );
  await f.call("PUT", `/users/${id}/delegation`, 0, { policyIds: [f.blocked] });
  const listed = (await f.call("GET", "/users")).json().data as {
    id: string;
    hasDelegation: boolean;
  }[];
  assert.equal(listed.find((user) => user.id === id)?.hasDelegation, true);
  assert.equal(
    listed.find((user) => user.id === f.userIds[2])?.hasDelegation,
    false,
  );
  assert.equal(
    (await f.call("POST", `/users/${id}/invitation`, 1, {})).statusCode,
    403,
  );
});
