import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { Knex } from "knex";
import { oauthFixture } from "./support/oauth-provider.js";
import { OAuthConsents, consentRequest } from "../src/oauth/consents.js";
import { createOAuthProvider } from "../src/oauth/provider.js";

type Fixture = Awaited<ReturnType<typeof oauthFixture>>;
type Flow = Awaited<ReturnType<Fixture["flow"]>>;
const identityScopes = "openid profile email";

function code(response: Awaited<ReturnType<Flow["consent"]>>) {
  assert.equal(response.statusCode, 303, response.body);
  const value = new URL(String(response.headers.location)).searchParams.get(
    "code",
  );
  assert.ok(value, String(response.headers.location));
  return value;
}

async function configure(f: Fixture, values: Record<string, unknown>) {
  const result = await f.app.inject({
    method: "PUT",
    url: `/oauth-apps/${f.application.id}`,
    headers: f.auth,
    payload: { ...f.input, ...values },
  });
  assert.equal(result.statusCode, 200, result.body);
}

async function revoke(f: Fixture, headers = f.auth) {
  const result = await f.app.inject({
    method: "DELETE",
    url: `/users/me/oauth-apps/${f.application.id}`,
    headers,
  });
  assert.equal(result.statusCode, 204, result.body);
}

test("Consent persists across restarts and grant expiry; subset reuse, expansion and forced consent", async () => {
  const f = await oauthFixture();
  try {
    const first = await f.flow(f.application.id, "openid email");
    assert.equal(first.details.json().data.canReuseConsent, false);
    assert.equal((await first.decision(true, { reuse: true })).statusCode, 409);
    code(await first.consent());
    const sameBrowser = await f.flow(
      f.application.id,
      "openid email",
      f.auth,
      {},
      first.jar,
    );
    assert.equal(sameBrowser.details.json().data.canReuseConsent, true);
    code(await sameBrowser.consent(true, { reuse: true }));
    const approved = await f.db("public.asmblyr_oauth_consents").first();
    assert.ok(approved.last_used_at);
    await f
      .db("public.asmblyr_oauth_state")
      .update({ expires_at: new Date(0) });
    await f
      .db("public.asmblyr_oauth_grants")
      .update({ expires_at: new Date(0) });
    await f.restart();
    const repeat = await f.flow(f.application.id, "openid email");
    assert.equal(repeat.details.json().data.canReuseConsent, true);
    assert.equal(
      (
        await f.exchange(
          code(await repeat.consent(true, { reuse: true })),
          repeat.verifier,
        )
      ).statusCode,
      200,
    );
    const subset = await f.flow(f.application.id, "openid");
    assert.equal(subset.details.json().data.canReuseConsent, true);
    code(await subset.consent(true, { reuse: true }));
    const expanded = await f.flow();
    assert.equal(expanded.details.json().data.canReuseConsent, false);
    assert.equal(
      (await expanded.decision(true, { reuse: true })).statusCode,
      409,
    );
    code(await expanded.consent());
    const forced = await f.flow(f.application.id, identityScopes, f.auth, {
      prompt: "consent",
    });
    assert.equal(forced.details.json().data.canReuseConsent, false);
    assert.equal(
      (await forced.decision(true, { reuse: true })).statusCode,
      409,
    );
    code(await forced.consent());
    assert.equal((await f.db("public.asmblyr_oauth_consents")).length, 1);
    const rejected = await f.flow(f.application.id, identityScopes, f.auth, {
      prompt: "consent",
    });
    assert.match(
      String((await rejected.consent(false)).headers.location),
      /error=access_denied/,
    );
    assert.equal((await f.flow()).details.json().data.canReuseConsent, true);
  } finally {
    await f.close();
  }
});

test("Connected apps belong to the current user; revoke isolates users and kills codes, UserInfo and pending resumes", async () => {
  const f = await oauthFixture();
  try {
    await configure(f, { accessMode: "all", audience: "", scopes: [] });
    const first = await f.flow(f.application.id, identityScopes);
    const firstToken = await f.exchange(
      code(await first.consent()),
      first.verifier,
    );
    assert.equal(firstToken.statusCode, 200, firstToken.body);
    const other = await f.flow(f.application.id, identityScopes, f.otherAuth);
    assert.equal(other.details.json().data.canReuseConsent, false);
    // A different Asmblyr account cannot complete an interaction bound to the first account.
    const switched = await f.flow(f.application.id, identityScopes);
    assert.equal(
      (await switched.consent(true, { reuse: true }, f.otherAuth)).statusCode,
      400,
    );
    const otherToken = await f.exchange(
      code(await other.consent()),
      other.verifier,
    );
    assert.equal(otherToken.statusCode, 200, otherToken.body);
    const pending = await f.flow(f.application.id, identityScopes);
    const pendingCode = code(await pending.consent(true, { reuse: true }));
    const pendingResume = await f.flow(f.application.id, identityScopes);
    const decision = await pendingResume.decision(true, { reuse: true });
    assert.equal(decision.statusCode, 200, decision.body);
    const stale = await f.flow(f.application.id, identityScopes);
    assert.equal(stale.details.json().data.canReuseConsent, true);
    const list = await f.app.inject({
      url: "/users/me/oauth-apps",
      headers: f.auth,
    });
    assert.equal(list.json().data.length, 1);
    assert.deepEqual(list.json().data[0].scopes, [
      "email",
      "openid",
      "profile",
    ]);
    assert.ok(list.json().data[0].lastUsedAt);
    assert.equal(
      (await f.app.inject({ url: "/users/me/oauth-apps" })).statusCode,
      401,
    );
    await revoke(f);
    assert.equal((await stale.decision(true, { reuse: true })).statusCode, 409);
    assert.equal(
      (await f.exchange(pendingCode, pending.verifier)).json().error,
      "invalid_grant",
    );
    const resumed = await pendingResume.resume(decision.json().data.redirectTo);
    assert.ok(
      !String(resumed.headers.location).includes("code="),
      resumed.body,
    );
    const profile = (token: string) =>
      f.app.inject({
        url: "/oauth/me",
        headers: { authorization: `Bearer ${token}` },
      });
    assert.equal(
      (await profile(firstToken.json().access_token)).statusCode,
      401,
    );
    assert.equal(
      (await profile(otherToken.json().access_token)).statusCode,
      200,
    );
    assert.deepEqual(
      (
        await f.app.inject({ url: "/users/me/oauth-apps", headers: f.auth })
      ).json().data,
      [],
    );
    assert.equal(
      (
        await f.app.inject({
          url: "/users/me/oauth-apps",
          headers: f.otherAuth,
        })
      ).json().data.length,
      1,
    );
    await revoke(f); // Idempotent; no other user's consent is removed.
    const again = await f.flow(f.application.id, "openid");
    assert.equal(again.details.json().data.canReuseConsent, false);
    code(await again.consent());
    assert.equal(
      (await f.flow(f.application.id, identityScopes)).details.json().data
        .canReuseConsent,
      false,
    );
    assert.equal(
      (await profile(firstToken.json().access_token)).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});

test("Reuse rechecks eligibility; cosmetic edits preserve consent while new recipients invalidate it", async () => {
  const f = await oauthFixture();
  try {
    code(await (await f.flow()).consent());
    await configure(f, { name: "New name" });
    assert.equal((await f.flow()).details.json().data.canReuseConsent, true);
    const stale = await f.flow();
    await f
      .db("public.asmblyr_oauth_app_users")
      .where({ app_id: f.application.id })
      .delete();
    assert.equal((await f.flow()).details.json().data.canReuseConsent, false);
    assert.match(
      String((await stale.consent(true, { reuse: true })).headers.location),
      /error=access_denied/,
    );
    await configure(f, {});
    await configure(f, {
      redirectUris: [...f.input.redirectUris, "http://localhost:4567/other"],
    });
    assert.equal((await f.flow()).details.json().data.canReuseConsent, false);
    code(await (await f.flow()).consent());
    await configure(f, { audience: "different-service" });
    assert.equal((await f.flow()).details.json().data.canReuseConsent, false);
  } finally {
    await f.close();
  }
});

test("Consent migration preserves existing applications, never backfills approval, and refuses destructive rollback", async () => {
  const f = await oauthFixture();
  const migration = createRequire(import.meta.url)(
    "../migrations/20261002040000_oauth_consents.cjs",
  ) as {
    up(db: Knex): Promise<void>;
    down(db: Knex): Promise<void>;
  };
  const policyMigration = createRequire(import.meta.url)(
    "../migrations/20261007030000_oauth_policy_access.cjs",
  ) as { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };
  try {
    await f.db.transaction(async (trx) => {
      await policyMigration.down(trx);
      await migration.down(trx);
      await migration.up(trx);
      await policyMigration.up(trx);
      assert.equal(
        (await trx("public.asmblyr_oauth_apps").first()).id,
        f.application.id,
      );
      assert.deepEqual(await trx("public.asmblyr_oauth_consents"), []);
    });
    code(await (await f.flow()).consent());
    await assert.rejects(
      migration.down(f.db),
      /Cannot discard saved OAuth consents/,
    );
  } finally {
    await f.close();
  }
});

test("An in-flight grant cannot be saved after revocation, even after the user approves again", async () => {
  const f = await oauthFixture();
  try {
    const { applications, provider } = createOAuthProvider(f.db, f.config);
    const consents = new OAuthConsents(f.db, applications);
    const request = consentRequest({ scope: identityScopes });
    const old = await consents.authorize(
      f.application.id,
      f.users[0],
      request,
      false,
    );
    const grant = new provider.Grant({
      clientId: f.application.id,
      accountId: f.users[0],
    });
    grant.jti = old.grantId;
    grant.addOIDCScope(identityScopes);
    await grant.save();
    await consents.revoke(f.application.id, f.users[0]);
    await consents.authorize(f.application.id, f.users[0], request, false);
    await assert.rejects(grant.save(), { name: "InvalidGrant" });
    assert.equal(await provider.Grant.find(old.grantId), undefined);
  } finally {
    await f.close();
  }
});
