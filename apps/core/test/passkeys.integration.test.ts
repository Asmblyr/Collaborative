import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { createApp } from "../src/app.js";
import { inviteUser } from "../src/auth/invitations.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { virtualPasskey } from "./support/webauthn.js";

test("passwordless invitation, WebAuthn registration/login and recovery are single-use and scoped", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  try {
    const invitation = await inviteUser(
      db,
      `passkey_${Date.now()}@example.test`,
    );
    const claim = () =>
      app.inject({
        method: "POST",
        url: "/auth/invitations/claim",
        payload: { token: invitation.invitationToken },
      });
    const claims = await Promise.all([claim(), claim()]);
    assert.deepEqual(claims.map((r) => r.statusCode).sort(), [200, 401]);
    const tokens = claims.find((r) => r.statusCode === 200)!.json();
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    assert.equal(
      await db("public.asmblyr_password_credentials")
        .where({ user_id: invitation.user.id })
        .first(),
      undefined,
    );
    const key = virtualPasskey();
    const options = (
      await app.inject({
        method: "POST",
        url: "/users/me/passkeys/options",
        headers,
        payload: {},
      })
    ).json();
    const register = await app.inject({
      method: "POST",
      url: "/users/me/passkeys",
      headers,
      payload: {
        challengeId: options.challengeId,
        name: "Тестовый ключ",
        response: key.registration(options.options.challenge),
      },
    });
    assert.equal(register.statusCode, 201, register.body);
    assert.equal(register.json().data.length, 1);
    const replay = await app.inject({
      method: "POST",
      url: "/users/me/passkeys",
      headers,
      payload: {
        challengeId: options.challengeId,
        response: key.registration(options.options.challenge),
      },
    });
    assert.equal(replay.statusCode, 401);
    const loginOptions = async () =>
      (
        await app.inject({
          method: "POST",
          url: "/auth/passkeys/options",
          payload: {},
        })
      ).json();
    let challenge = await loginOptions();
    const badOrigin = await app.inject({
      method: "POST",
      url: "/auth/passkeys/login",
      payload: {
        challengeId: challenge.challengeId,
        response: key.authentication(
          challenge.options.challenge,
          1,
          "https://evil.example",
        ),
      },
    });
    assert.equal(badOrigin.statusCode, 401);
    const retry = await app.inject({
      method: "POST",
      url: "/auth/passkeys/login",
      payload: {
        challengeId: challenge.challengeId,
        response: key.authentication(challenge.options.challenge),
      },
    });
    assert.equal(retry.statusCode, 401);
    challenge = await loginOptions();
    const unverified = await app.inject({
      method: "POST",
      url: "/auth/passkeys/login",
      payload: {
        challengeId: challenge.challengeId,
        response: key.authentication(
          challenge.options.challenge,
          1,
          undefined,
          false,
        ),
      },
    });
    assert.equal(unverified.statusCode, 401);
    challenge = await loginOptions();
    const login = await app.inject({
      method: "POST",
      url: "/auth/passkeys/login",
      payload: {
        challengeId: challenge.challengeId,
        response: key.authentication(challenge.options.challenge),
      },
    });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/users/me/passkeys/${key.id}`,
          headers,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/users/${invitation.user.id}/invitation`,
          headers,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/users/${invitation.user.id}/recovery`,
          headers,
        })
      ).statusCode,
      403,
    );
    const [admin] = await db("public.asmblyr_users")
      .insert({
        email: `recovery_admin_${Date.now()}@example.test`,
        superuser: true,
      })
      .returning("id");
    const adminPair = await issueUserTokens(db, admin.id);
    const adminHeaders = { authorization: `Bearer ${adminPair.accessToken}` };
    const renewal = await app.inject({
      method: "POST",
      url: `/users/${invitation.user.id}/invitation`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(renewal.statusCode, 409);
    const recovery = await app.inject({
      method: "POST",
      url: `/users/${invitation.user.id}/recovery`,
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(recovery.statusCode, 200, recovery.body);
    const recover = await app.inject({
      method: "POST",
      url: "/auth/invitations/claim",
      payload: { token: recovery.json().data.invitationToken },
    });
    assert.equal(recover.statusCode, 200, recover.body);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/invitations/claim",
          payload: { token: recovery.json().data.invitationToken },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: "/auth/me", headers }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await db("public.asmblyr_passkeys").where({
          user_id: invitation.user.id,
        })
      ).length,
      0,
    );
    const recoveredHeaders = {
      authorization: `Bearer ${recover.json().accessToken}`,
    };
    const initial = await app.inject({
      method: "POST",
      url: "/users/me/password/setup",
      headers: recoveredHeaders,
      payload: { password: "new-safe-test-password" },
    });
    assert.equal(initial.statusCode, 204, initial.body);
    const duplicate = await app.inject({
      method: "POST",
      url: "/users/me/password/setup",
      headers: recoveredHeaders,
      payload: { password: "other-safe-test-password" },
    });
    assert.equal(duplicate.statusCode, 409);
    await db("public.asmblyr_auth_sessions")
      .where({ user_id: invitation.user.id })
      .update({ created_at: new Date(Date.now() - 3600000) });
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/users/me/passkeys/options",
          headers: recoveredHeaders,
          payload: {},
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    await db.destroy();
  }
});

test("passkeys reject disabled users, stale counters, expired and cross-session challenges", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  try {
    const invitation = await inviteUser(
      db,
      `passkey_negative_${Date.now()}@example.test`,
    );
    const pair = await issueUserTokens(db, invitation.user.id);
    const other = await issueUserTokens(db, invitation.user.id);
    const headers = { authorization: `Bearer ${pair.accessToken}` };
    const key = virtualPasskey();
    const options = (
      await app.inject({
        method: "POST",
        url: "/users/me/passkeys/options",
        headers,
        payload: {},
      })
    ).json();
    const cross = await app.inject({
      method: "POST",
      url: "/users/me/passkeys",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: {
        challengeId: options.challengeId,
        response: key.registration(options.options.challenge),
      },
    });
    assert.equal(cross.statusCode, 401);
    const saved = await app.inject({
      method: "POST",
      url: "/users/me/passkeys",
      headers,
      payload: {
        challengeId: options.challengeId,
        response: key.registration(options.options.challenge),
      },
    });
    assert.equal(saved.statusCode, 201, saved.body);
    const optionsForLogin = async () =>
      (
        await app.inject({
          method: "POST",
          url: "/auth/passkeys/options",
          payload: {},
        })
      ).json();
    let challenge = await optionsForLogin();
    await db("public.asmblyr_passkey_challenges")
      .where({ id: challenge.challengeId })
      .update({ expires_at: new Date(0) });
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/passkeys/login",
          payload: {
            challengeId: challenge.challengeId,
            response: key.authentication(challenge.options.challenge),
          },
        })
      ).statusCode,
      401,
    );
    await db("public.asmblyr_passkeys")
      .where({ id: key.id })
      .update({ counter: 4 });
    challenge = await optionsForLogin();
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/passkeys/login",
          payload: {
            challengeId: challenge.challengeId,
            response: key.authentication(challenge.options.challenge, 3),
          },
        })
      ).statusCode,
      401,
    );
    await db("public.asmblyr_users")
      .where({ id: invitation.user.id })
      .update({ status: "disabled" });
    challenge = await optionsForLogin();
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/passkeys/login",
          payload: {
            challengeId: challenge.challengeId,
            response: key.authentication(challenge.options.challenge, 5),
          },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    await db.destroy();
  }
});
