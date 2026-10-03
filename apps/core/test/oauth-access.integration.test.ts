import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { Knex } from "knex";
import { oauthFixture } from "./support/oauth-provider.js";

type Fixture = Awaited<ReturnType<typeof oauthFixture>>;

async function configure(f: Fixture, access: Record<string, unknown>) {
  const response = await f.app.inject({
    method: "PUT",
    url: `/oauth-apps/${f.application.id}`,
    headers: f.auth,
    payload: { ...f.input, ...access },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.application;
}

async function codeFor(flow: Awaited<ReturnType<Fixture["flow"]>>) {
  const response = await flow.consent();
  assert.equal(response.statusCode, 303, response.body);
  const code = new URL(String(response.headers.location)).searchParams.get("code");
  assert.ok(code, String(response.headers.location));
  return code;
}

test("All-user apps admit unassigned active users and recheck disabled accounts before exchanging codes", async () => {
  const f = await oauthFixture();
  try {
    assert.equal(f.application.accessMode, "selected");
    assert.deepEqual(f.application.userIds, [f.users[0]]);
    const updated = await configure(f, { accessMode: "all" });
    assert.deepEqual(updated.userIds, []);
    const flow = await f.flow(f.application.id, undefined, f.otherAuth);
    assert.equal(flow.details.json().data.allowed, true);
    const code = await codeFor(flow);
    assert.equal((await f.exchange(code, flow.verifier)).statusCode, 200);

    const beforeBlock = await f.flow(f.application.id, undefined, f.otherAuth);
    const pendingCode = await codeFor(beforeBlock);
    await f.db("public.asmblyr_users").where({ id: f.users[1] }).update({ status: "disabled" });
    assert.equal(
      (await f.exchange(pendingCode, beforeBlock.verifier)).json().error,
      "invalid_grant",
    );
    // Even a still valid Asmblyr session cannot approve a new interaction after blocking.
    const blockedConsent = await beforeBlock.consent();
    assert.equal(blockedConsent.statusCode, 401);
  } finally {
    await f.close();
  }
});

test("Domain access uses exact local email domains, with optional explicit-user exceptions", async () => {
  const f = await oauthFixture();
  try {
    const settings = { accessMode: "domains", emailDomains: ["@EXAMPLE.test"], userIds: [] };
    const updated = await configure(f, settings);
    assert.deepEqual(updated.emailDomains, ["example.test"]);
    const flow = await f.flow(f.application.id, undefined, f.otherAuth);
    assert.equal(flow.details.json().data.allowed, true);
    await f
      .db("public.asmblyr_users")
      .where({ id: f.users[1] })
      .update({ email: "outside@other.test" });
    assert.match(String((await flow.consent()).headers.location), /error=access_denied/);

    for (const email of [
      "user@badexample.test",
      "user@team.example.test",
      "user@example.test.attacker.test",
    ]) {
      await f.db("public.asmblyr_users").where({ id: f.users[1] }).update({ email });
      const denied = await f.flow(f.application.id, undefined, f.otherAuth);
      assert.equal(denied.details.json().data.allowed, false, email);
      assert.match(String((await denied.consent()).headers.location), /error=access_denied/);
    }
    await configure(f, { ...settings, userIds: [f.users[1]] });
    const exception = await f.flow(f.application.id, undefined, f.otherAuth);
    assert.equal(exception.details.json().data.allowed, true);
    const code = await codeFor(exception);
    assert.equal((await f.exchange(code, exception.verifier)).statusCode, 200);

    const listed = await f.app.inject({ url: "/oauth-apps", headers: f.auth });
    const saved = listed.json().data.find((entry: { id: string }) => entry.id === f.application.id);
    assert.equal(saved.accessMode, "domains");
    assert.deepEqual(saved.emailDomains, ["example.test"]);
    assert.deepEqual(saved.userIds, [f.users[1]]);

    await configure(f, { accessMode: "selected", userIds: [] });
    const superuser = await f.flow();
    assert.equal(superuser.details.json().data.allowed, false);
  } finally {
    await f.close();
  }
});

test("Domain eligibility is rechecked at code exchange and UserInfo; changing mode revokes previous grants", async () => {
  const f = await oauthFixture();
  try {
    const settings = {
      accessMode: "domains",
      emailDomains: ["example.test"],
      userIds: [],
      audience: "",
      scopes: [],
    };
    await configure(f, settings);
    const flow = await f.flow(f.application.id, "openid profile email");
    const response = await f.exchange(await codeFor(flow), flow.verifier);
    assert.equal(response.statusCode, 200, response.body);
    const headers = { authorization: `Bearer ${response.json().access_token}` };
    assert.equal((await f.app.inject({ url: "/oauth/me", headers })).statusCode, 200);
    await f
      .db("public.asmblyr_users")
      .where({ id: f.users[0] })
      .update({ email: "owner@outside.test" });
    assert.equal((await f.app.inject({ url: "/oauth/me", headers })).statusCode, 401);

    await f
      .db("public.asmblyr_users")
      .where({ id: f.users[0] })
      .update({ email: `${f.users[0]}@example.test` });
    const pending = await f.flow(f.application.id, "openid profile email");
    const code = await codeFor(pending);
    await f
      .db("public.asmblyr_users")
      .where({ id: f.users[0] })
      .update({ email: "owner@outside.test" });
    assert.equal((await f.exchange(code, pending.verifier)).json().error, "invalid_grant");

    await configure(f, { accessMode: "all", audience: "", scopes: [] });
    const beforeRestriction = await f.flow(f.application.id, "openid profile email");
    const oldCode = await codeFor(beforeRestriction);
    await configure(f, { accessMode: "selected", userIds: [], audience: "", scopes: [] });
    assert.equal(
      (await f.exchange(oldCode, beforeRestriction.verifier)).json().error,
      "invalid_grant",
    );
  } finally {
    await f.close();
  }
});

test("Access migration preserves existing memberships and refuses to drop configured domain or all-user rules", async () => {
  const f = await oauthFixture();
  const migration = createRequire(import.meta.url)(
    "../migrations/20261002030000_oauth_application_access.cjs",
  ) as {
    up(db: Knex): Promise<void>;
    down(db: Knex): Promise<void>;
  };
  try {
    await f.db.transaction(async (trx) => {
      await migration.down(trx);
      await migration.up(trx);
      const app = await trx("public.asmblyr_oauth_apps").where({ id: f.application.id }).first();
      assert.equal(app.access_mode, "selected");
      assert.deepEqual(app.email_domains, []);
      const users = await trx("public.asmblyr_oauth_app_users").where({ app_id: f.application.id });
      assert.deepEqual(
        users.map((entry) => entry.user_id),
        [f.users[0]],
      );
    });
    for (const access of [
      { accessMode: "all" },
      { accessMode: "domains", emailDomains: ["example.test"] },
    ]) {
      await configure(f, access);
      await assert.rejects(migration.down(f.db), /Cannot discard/);
    }
  } finally {
    await f.close();
  }
});
