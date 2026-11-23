import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { inviteUser } from "../src/auth/invitations.js";
import { SsoService } from "../src/auth/sso/service.js";
import { SsoProtocol } from "../src/auth/sso/protocol.js";
import {
  fakeSsoProvider,
  type FakeAuthorizeOptions,
  type FakeSsoOptions,
} from "./support/sso-provider.js";

async function createSsoHarness(options: FakeSsoOptions) {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const fake = await fakeSsoProvider(options);
  const sso = new SsoService([fake.provider], new SsoProtocol(fake.transport));
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sso,
  });

  async function startLogin(authOptions: FakeAuthorizeOptions) {
    const browserToken = randomBytes(32).toString("base64url");
    const response = await app.inject({
      method: "POST",
      url: "/auth/sso/okkam/start",
      payload: {
        browserToken,
        intent: "login",
        returnTo: "/items/tasks",
        uiOrigin: "http://localhost:3000",
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    return {
      browserToken,
      query: fake.authorize(response.json().authorizationUrl, authOptions),
    };
  }

  function completeLogin(payload: { browserToken: string; query: string }) {
    return app.inject({
      method: "POST",
      url: "/auth/sso/okkam/callback",
      payload,
    });
  }

  return {
    database,
    fake,
    app,
    startLogin,
    completeLogin,
    async close(userEmails: string[], policyIds: string[] = []) {
      await database("public.asmblyr_auth_flows").delete();
      if (userEmails.length > 0) {
        await database("public.asmblyr_users")
          .whereIn("email", userEmails)
          .delete();
      }
      if (policyIds.length > 0) {
        await database("public.asmblyr_policies")
          .whereIn("id", policyIds)
          .delete();
      }
      await app.close();
      await database.destroy();
    },
  };
}

test("SSO auto-link binds existing active user by email, closes pending invitation, enforces guards, and rejects conflicts", async () => {
  const harness = await createSsoHarness({
    driver: "openid",
    env: {
      AUTH_OKKAM_AUTO_LINK_BY_EMAIL: "true",
      AUTH_OKKAM_REQUIRE_VERIFIED_EMAIL: "true",
      AUTH_OKKAM_ALLOWED_EMAIL_DOMAINS: "corp.example",
    },
  });
  const { database, app, startLogin, completeLogin } = harness;
  const invitedEmail = `invited-${randomUUID()}@corp.example`;
  const disabledEmail = `disabled-${randomUUID()}@corp.example`;
  const unverifiedEmail = `unverified-${randomUUID()}@corp.example`;
  const foreignEmail = `foreign-${randomUUID()}@other.example`;
  const emails = [invitedEmail, disabledEmail, unverifiedEmail, foreignEmail];

  try {
    const invited = await inviteUser(database, invitedEmail);
    await database("public.asmblyr_users").insert([
      { email: disabledEmail, status: "disabled", superuser: false },
      { email: unverifiedEmail, status: "active", superuser: false },
      { email: foreignEmail, status: "active", superuser: false },
    ]);

    // 1. Auto-link matches case-insensitively, logs in, and closes pending invitation
    const first = await completeLogin(
      await startLogin({
        subject: "corp-sub-1",
        idTokenClaims: {
          email: invitedEmail.toUpperCase(),
          email_verified: true,
        },
      }),
    );
    assert.equal(first.statusCode, 200, first.body);
    const tokens = first.json().tokens;
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    assert.equal(me.json().data.id, invited.user.id);

    const invitationRow = await database("public.asmblyr_user_invitations")
      .where({ user_id: invited.user.id })
      .first<{ consumed_at: Date | null }>("consumed_at");
    assert.ok(invitationRow?.consumed_at, "Pending invitation must be closed");

    const oldInviteAttempt = await app.inject({
      method: "POST",
      url: "/auth/invitations/claim",
      payload: { token: invited.invitationToken },
    });
    assert.equal(oldInviteAttempt.statusCode, 401);

    // Subsequent login uses the persisted identity directly
    const second = await completeLogin(
      await startLogin({
        subject: "corp-sub-1",
        idTokenClaims: {},
      }),
    );
    assert.equal(second.statusCode, 200, second.body);

    // 2. Different subject of the same provider for the same email returns conflict without overwriting
    const conflict = await completeLogin(
      await startLogin({
        subject: "corp-sub-2",
        idTokenClaims: { email: invitedEmail, email_verified: true },
      }),
    );
    assert.equal(conflict.json().code, "SSO_IDENTITY_CONFLICT");
    const linked = await database("public.asmblyr_user_identities")
      .where({ user_id: invited.user.id })
      .select("subject");
    assert.deepEqual(linked, [{ subject: "corp-sub-1" }]);

    // 3. Disabled user is denied and never linked
    const disabled = await completeLogin(
      await startLogin({
        subject: "disabled-sub",
        idTokenClaims: { email: disabledEmail, email_verified: true },
      }),
    );
    assert.equal(disabled.json().code, "SSO_AUTH_FAILED");
    assert.equal(
      (
        await database("public.asmblyr_user_identities").where({
          subject: "disabled-sub",
        })
      ).length,
      0,
    );

    // 4. Unverified email is rejected when requireVerifiedEmail is true
    const unverified = await completeLogin(
      await startLogin({
        subject: "unverified-sub",
        idTokenClaims: { email: unverifiedEmail, email_verified: false },
      }),
    );
    assert.equal(unverified.json().code, "SSO_NOT_LINKED");

    // 5. Email outside allowedEmailDomains is rejected
    const wrongDomain = await completeLogin(
      await startLogin({
        subject: "foreign-sub",
        idTokenClaims: { email: foreignEmail, email_verified: true },
      }),
    );
    assert.equal(wrongDomain.json().code, "SSO_NOT_LINKED");

    // 6. Audit records dedicated auto-link event alongside SSO login
    const audit = await database("public.asmblyr_security_events").where({
      actor_id: invited.user.id,
    });
    assert.ok(audit.some((row) => row.action === "user.identity_auto_linked"));
    assert.ok(audit.some((row) => row.action === "user.sso_login"));
  } finally {
    await harness.close(emails);
  }
});

test("SSO auto-link refuses unverified email linking to an existing superuser", async () => {
  const harness = await createSsoHarness({
    driver: "openid",
    env: {
      AUTH_OKKAM_AUTO_LINK_BY_EMAIL: "true",
      AUTH_OKKAM_REQUIRE_VERIFIED_EMAIL: "false",
    },
  });
  const { database, startLogin, completeLogin } = harness;
  const adminEmail = `super-${randomUUID()}@corp.example`;

  try {
    await database("public.asmblyr_users").insert({
      email: adminEmail,
      status: "active",
      superuser: true,
    });

    const attempt = await completeLogin(
      await startLogin({
        subject: "unverified-super-sub",
        idTokenClaims: { email: adminEmail },
      }),
    );
    assert.equal(attempt.json().code, "SSO_NOT_LINKED");
    assert.equal(
      (
        await database("public.asmblyr_user_identities").where({
          subject: "unverified-super-sub",
        })
      ).length,
      0,
    );
  } finally {
    await harness.close([adminEmail]);
  }
});

test("SSO JIT provisions new user via OIDC userinfo with default policies, blocks sole-identity unlink, and handles concurrent first logins", async () => {
  const setupDb = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const policyByNameId = randomUUID();
  const policyByUuidId = randomUUID();
  const policyName = `SSO Default ${randomUUID().slice(0, 8)}`;
  await setupDb("public.asmblyr_policies").insert([
    { id: policyByNameId, name: policyName },
    { id: policyByUuidId, name: `SSO UUID ${randomUUID().slice(0, 8)}` },
  ]);
  await setupDb.destroy();

  const harness = await createSsoHarness({
    driver: "openid",
    advertiseUserInfo: true,
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_AUTO_LINK_BY_EMAIL: "false",
      AUTH_OKKAM_REQUIRE_VERIFIED_EMAIL: "true",
      AUTH_OKKAM_ALLOWED_EMAIL_DOMAINS: "corp.example",
      AUTH_OKKAM_DEFAULT_POLICIES: `${policyName}, ${policyByUuidId}`,
    },
  });
  const { database, fake, app, startLogin, completeLogin } = harness;
  const jitEmail = `newbie-${randomUUID()}@corp.example`;
  const existingEmail = `existing-${randomUUID()}@corp.example`;
  const raceEmail = `race-${randomUUID()}@corp.example`;
  const emails = [jitEmail, existingEmail, raceEmail];

  try {
    await database("public.asmblyr_users").insert({
      email: existingEmail,
      status: "active",
      superuser: false,
    });

    // 1. Minimal id_token triggers userinfo fallback and provisions user with profile & default policies
    const provisioned = await completeLogin(
      await startLogin({
        subject: "jit-sub-1",
        idTokenClaims: {},
        userInfo: {
          sub: "jit-sub-1",
          email: jitEmail.toUpperCase(),
          email_verified: true,
          given_name: "Maria",
          family_name: "Sokolova",
          name: "Maria Sokolova",
        },
      }),
    );
    assert.equal(provisioned.statusCode, 200, provisioned.body);
    assert.equal(fake.userInfoCalls(), 1);

    const tokens = provisioned.json().tokens;
    const authHeaders = { authorization: `Bearer ${tokens.accessToken}` };
    const profileRes = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: authHeaders,
    });
    assert.equal(profileRes.statusCode, 200, profileRes.body);
    const profile = profileRes.json().data;
    assert.equal(profile.email, jitEmail);
    assert.equal(profile.superuser, false);
    assert.equal(profile.hasPassword, false);
    assert.equal(profile.firstName, "Maria");
    assert.equal(profile.lastName, "Sokolova");
    assert.equal(profile.displayName, "Maria Sokolova");

    const assignedPolicies = await database("public.asmblyr_user_policies")
      .where({ user_id: profile.id })
      .select<{ policy_id: string }[]>("policy_id");
    assert.deepEqual(
      assignedPolicies.map((row) => row.policy_id).sort(),
      [policyByNameId, policyByUuidId].sort(),
    );

    const audit = await database("public.asmblyr_security_events").where({
      actor_id: profile.id,
    });
    assert.ok(audit.some((row) => row.action === "user.sso_provisioned"));
    assert.ok(audit.some((row) => row.action === "user.sso_login"));

    // 2. JIT-created passwordless user cannot unlink their sole SSO identity until adding a password
    const identitiesRes = await app.inject({
      method: "GET",
      url: "/users/me/identities",
      headers: authHeaders,
    });
    assert.equal(identitiesRes.json().data.length, 1);
    const identityId = identitiesRes.json().data[0].id;

    const blockedUnlink = await app.inject({
      method: "DELETE",
      url: `/users/me/identities/${identityId}`,
      headers: authHeaders,
    });
    assert.equal(blockedUnlink.json().code, "SSO_LAST_IDENTITY");

    const addPassword = await app.inject({
      method: "POST",
      url: "/users/me/password/setup",
      headers: authHeaders,
      payload: { password: "StrongPassword123!" },
    });
    assert.equal(addPassword.statusCode, 204, addPassword.body);

    const allowedUnlink = await app.inject({
      method: "DELETE",
      url: `/users/me/identities/${identityId}`,
      headers: authHeaders,
    });
    assert.equal(allowedUnlink.statusCode, 204);

    // 3. When autoProvision=true but autoLinkByEmail=false, existing user is NOT auto-linked
    const existingDenied = await completeLogin(
      await startLogin({
        subject: "existing-sub",
        idTokenClaims: { email: existingEmail, email_verified: true },
      }),
    );
    assert.equal(existingDenied.json().code, "SSO_NOT_LINKED");

    // 4. Concurrent first logins for the same new user succeed atomically without duplicates
    const [flowA, flowB] = await Promise.all([
      startLogin({
        subject: "race-sub-1",
        idTokenClaims: {
          email: raceEmail,
          email_verified: true,
          name: "Race User",
        },
      }),
      startLogin({
        subject: "race-sub-1",
        idTokenClaims: {
          email: raceEmail,
          email_verified: true,
          name: "Race User",
        },
      }),
    ]);
    const [resA, resB] = await Promise.all([
      completeLogin(flowA),
      completeLogin(flowB),
    ]);
    assert.equal(resA.statusCode, 200, resA.body);
    assert.equal(resB.statusCode, 200, resB.body);

    const raceUsers = await database("public.asmblyr_users").where({
      email: raceEmail,
    });
    assert.equal(raceUsers.length, 1);
    const raceIdentities = await database(
      "public.asmblyr_user_identities",
    ).where({ user_id: raceUsers[0].id });
    assert.equal(raceIdentities.length, 1);
  } finally {
    await harness.close(emails, [policyByNameId, policyByUuidId]);
  }
});

test("OAuth2 JIT supports custom profile field mapping and disabled email_verified check for internal SSO", async () => {
  const harness = await createSsoHarness({
    driver: "oauth2",
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_REQUIRE_VERIFIED_EMAIL: "false",
      AUTH_OKKAM_EMAIL_KEY: "corp.mail",
      AUTH_OKKAM_FIRST_NAME_KEY: "corp.given",
      AUTH_OKKAM_LAST_NAME_KEY: "corp.family",
      AUTH_OKKAM_DISPLAY_NAME_KEY: "corp.title",
    },
  });
  const { app, startLogin, completeLogin } = harness;
  const oauthEmail = `oauth-${randomUUID()}@internal.example`;

  try {
    const res = await completeLogin(
      await startLogin({
        subject: "oauth-jit-42",
        oauth2Profile: {
          account: { id: "oauth-jit-42" },
          corp: {
            mail: oauthEmail,
            given: "Alex",
            family: "Orlov",
            title: "Alex Orlov",
          },
        },
      }),
    );
    assert.equal(res.statusCode, 200, res.body);
    const me = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { authorization: `Bearer ${res.json().tokens.accessToken}` },
    });
    assert.equal(me.json().data.email, oauthEmail);
    assert.equal(me.json().data.superuser, false);
    assert.equal(me.json().data.firstName, "Alex");
    assert.equal(me.json().data.lastName, "Orlov");
    assert.equal(me.json().data.displayName, "Alex Orlov");
  } finally {
    await harness.close([oauthEmail]);
  }
});
