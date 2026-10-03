import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("invited second account receives only assigned collection fields", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const name = `test_invite_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const email = `${randomUUID()}@example.test`;
  const ids: string[] = [];
  let policyId: string | undefined;
  try {
    const [admin] = await database("asmblyr_users").withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: true })
      .returning<{ id: string }[]>("id");
    ids.push(admin.id);
    const adminAuth = { authorization: `Bearer ${(await issueUserTokens(database, admin.id)).accessToken}` };

    assert.equal((await app.inject({ method: "GET", url: "/users" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/users", payload: { email } })).statusCode, 401);
    const created = await app.inject({ method: "POST", url: "/users", headers: adminAuth,
      payload: { email: email.toUpperCase() } });
    assert.equal(created.statusCode, 201, created.body);
    const { user, invitationToken, expiresAt } = created.json().data as {
      user: { id: string; email: string; superuser: boolean }; invitationToken: string; expiresAt: string;
    };
    ids.push(user.id);
    assert.equal(user.email, email);
    assert.equal(user.superuser, false);
    assert.ok(new Date(expiresAt) > new Date());
    assert.equal((await app.inject({ method: "POST", url: "/users", headers: adminAuth,
      payload: { email } })).statusCode, 409);
    const invitation = await database("asmblyr_user_invitations").withSchema("public")
      .where({ user_id: user.id }).first<{ token_hash: string; consumed_at: Date | null }>();
    assert.equal(invitation?.token_hash, createHash("sha256").update(invitationToken).digest("hex"));
    assert.equal(invitation?.consumed_at, null);

    const listed = await app.inject({ method: "GET", url: "/users", headers: adminAuth });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.deepEqual(listed.json().data.find((entry: { id: string }) => entry.id === user.id).policyIds, []);
    assert.equal(listed.json().data.find((entry: { id: string }) => entry.id === user.id).hasPassword, false);

    const renewed = await app.inject({ method: "POST", url: `/users/${user.id}/invitation`,
      headers: adminAuth });
    assert.equal(renewed.statusCode, 200, renewed.body);
    const renewedToken = renewed.json().data.invitationToken as string;
    assert.notEqual(renewedToken, invitationToken);
    assert.equal((await app.inject({ method: "POST", url: "/auth/invitations/accept",
      payload: { token: invitationToken, password: "a-long-password-for-invite" } })).statusCode, 401);

    const password = "a-long-password-for-invite";
    const accepted = await app.inject({ method: "POST", url: "/auth/invitations/accept",
      payload: { token: renewedToken, password } });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().data.id, user.id);
    assert.equal((await app.inject({ method: "POST", url: "/auth/invitations/accept",
      payload: { token: renewedToken, password } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: `/users/${user.id}/invitation`,
      headers: adminAuth })).statusCode, 409);
    const login = await app.inject({ method: "POST", url: "/auth/login",
      payload: { email, password } });
    assert.equal(login.statusCode, 200, login.body);
    const memberAuth = { authorization: `Bearer ${login.json().accessToken}` };
    assert.equal((await app.inject({ method: "GET", url: "/users", headers: memberAuth })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: "/policies", headers: memberAuth })).statusCode, 403);

    const collection = await app.inject({ method: "POST", url: "/collections", headers: adminAuth,
      payload: { name, fields: [{ name: "title", type: "text" }, { name: "secret", type: "text" }] } });
    assert.equal(collection.statusCode, 201, collection.body);
    const item = await app.inject({ method: "POST", url: `/items/${name}`, headers: adminAuth,
      payload: { title: "Visible", secret: "Hidden" } });
    assert.equal(item.statusCode, 201, item.body);
    const itemId = item.json().data.id as string;
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}`,
      headers: memberAuth })).statusCode, 403);

    const policy = await app.inject({ method: "POST", url: "/policies", headers: adminAuth,
      payload: { name: `Invited ${name}` } });
    assert.equal(policy.statusCode, 201, policy.body);
    policyId = policy.json().data.id as string;
    const permission = await app.inject({ method: "POST", url: "/permissions", headers: adminAuth,
      payload: { collection: name, action: "read", fields: ["title"] } });
    assert.equal(permission.statusCode, 201, permission.body);
    assert.equal((await app.inject({ method: "PUT",
      url: `/policies/${policyId}/permissions/${permission.json().data.id}`,
      headers: adminAuth })).statusCode, 204);
    assert.equal((await app.inject({ method: "PUT", url: `/policies/${policyId}/users/${user.id}`,
      headers: adminAuth })).statusCode, 204);
    const afterAssign = await app.inject({ method: "GET", url: "/users", headers: adminAuth });
    assert.deepEqual(afterAssign.json().data.find((entry: { id: string }) => entry.id === user.id).policyIds, [policyId]);
    const visible = await app.inject({ method: "GET", url: `/items/${name}/${itemId}`,
      headers: memberAuth });
    assert.deepEqual(visible.json().data, { id: itemId, title: "Visible" });
    const history = await app.inject({ method: "GET", url: `/item-events/${name}`, headers: memberAuth });
    assert.equal(history.statusCode, 200, history.body);
    assert.ok(!history.body.includes("Hidden"));
    assert.equal((await app.inject({ method: "PATCH", url: `/items/${name}/${itemId}`,
      headers: memberAuth, payload: { title: "Denied" } })).statusCode, 403);
    assert.equal((await app.inject({ method: "DELETE", url: `/collections/${name}`,
      headers: memberAuth })).statusCode, 403);

    await database("asmblyr_users").withSchema("public").where({ id: user.id }).update({ status: "disabled" });
    assert.equal((await app.inject({ method: "GET", url: `/items/${name}`,
      headers: memberAuth })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/auth/login",
      payload: { email, password } })).statusCode, 401);

    const expired = await app.inject({ method: "POST", url: "/users", headers: adminAuth,
      payload: { email: `${randomUUID()}@example.test` } });
    assert.equal(expired.statusCode, 201, expired.body);
    ids.push(expired.json().data.user.id);
    await database("asmblyr_user_invitations").withSchema("public")
      .where({ user_id: expired.json().data.user.id }).update({ expires_at: new Date(Date.now() - 1000) });
    assert.equal((await app.inject({ method: "POST", url: "/auth/invitations/accept",
      payload: { token: expired.json().data.invitationToken, password } })).statusCode, 401);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    if (policyId) await database("asmblyr_policies").withSchema("public").where({ id: policyId }).delete();
    if (ids.length) await database("asmblyr_users").withSchema("public").whereIn("id", ids).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await database.destroy();
    await app.close();
  }
});
