import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import argon2 from "argon2";
import knex from "knex";
import { createApp } from "../src/app.js";
import { bootstrapSuperuser } from "../src/auth/users.js";

test("local login issues, rotates and revokes user tokens", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const setupToken = "test-setup-token-with-enough-entropy-123456789";
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    setupToken,
  });
  const email = `auth_${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";
  let userId: string | undefined;
  let setupUserId: string | undefined;

  try {
    const before = await app.inject({
      method: "GET",
      url: "/auth/setup/status",
    });
    assert.equal(before.statusCode, 200, before.body);
    assert.equal(before.json().configured, true);
    if (before.json().needsSetup) {
      const rejected = await app.inject({
        method: "POST",
        url: "/auth/setup",
        payload: {
          email: "setup@example.test",
          password,
          setupToken: "wrong-token",
        },
      });
      assert.equal(rejected.statusCode, 401, rejected.body);

      const setup = await app.inject({
        method: "POST",
        url: "/auth/setup",
        payload: { email: "setup@example.test", password, setupToken },
      });
      assert.equal(setup.statusCode, 201, setup.body);
      setupUserId = setup.json().data.id as string;
      const after = await app.inject({
        method: "GET",
        url: "/auth/setup/status",
      });
      assert.equal(after.json().needsSetup, false);

      const duplicate = await app.inject({
        method: "POST",
        url: "/auth/setup",
        payload: { email: "second@example.test", password, setupToken },
      });
      assert.equal(duplicate.statusCode, 409, duplicate.body);
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: setupUserId })
        .delete();
      setupUserId = undefined;
    }

    const [user] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email, superuser: true })
      .returning<{ id: string }[]>("id");
    userId = user.id;
    await database("asmblyr_password_credentials")
      .withSchema("public")
      .insert({ user_id: user.id, password_hash: await argon2.hash(password) });

    await assert.rejects(
      bootstrapSuperuser(database, "other@example.test", password),
      /Initial setup is already complete/,
    );

    const invalid = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrong-password" },
    });
    assert.equal(invalid.statusCode, 401, invalid.body);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: email.toUpperCase(), password },
    });
    assert.equal(login.statusCode, 200, login.body);
    const first = login.json() as { accessToken: string; refreshToken: string };
    assert.match(first.accessToken, /^asm_at_/);
    assert.match(first.refreshToken, /^asm_rt_/);
    assert.equal(login.headers["cache-control"], "no-store");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    assert.equal(me.statusCode, 200, me.body);
    const profile = me.json().data;
    assert.deepEqual(profile, {
      id: user.id,
      email,
      superuser: true,
      displayName: null,
      pictureUrl: null,
      hasPassword: true,
      createdAt: profile.createdAt,
    });
    assert.ok(Number.isFinite(Date.parse(profile.createdAt)));

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    assert.equal(refresh.statusCode, 200, refresh.body);
    const second = refresh.json() as {
      accessToken: string;
      refreshToken: string;
    };
    assert.notEqual(second.accessToken, first.accessToken);
    assert.notEqual(second.refreshToken, first.refreshToken);

    const oldAccess = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    assert.equal(oldAccess.statusCode, 401, oldAccess.body);

    const replay = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    assert.equal(replay.statusCode, 401, replay.body);
    const revoked = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    assert.equal(revoked.statusCode, 401, revoked.body);

    const again = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    assert.equal(again.statusCode, 200, again.body);
    const accessToken = (again.json() as { accessToken: string }).accessToken;
    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(logout.statusCode, 204, logout.body);
    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(afterLogout.statusCode, 401, afterLogout.body);

    const lastLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    assert.equal(lastLogin.statusCode, 200, lastLogin.body);
    const lastPair = lastLogin.json() as {
      accessToken: string;
      refreshToken: string;
    };
    const refreshLogout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: lastPair.refreshToken },
    });
    assert.equal(refreshLogout.statusCode, 204, refreshLogout.body);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/auth/me",
          headers: { authorization: `Bearer ${lastPair.accessToken}` },
        })
      ).statusCode,
      401,
    );

    await database("asmblyr_users")
      .withSchema("public")
      .where({ id: user.id })
      .update({ status: "disabled" });
    const disabled = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    assert.equal(disabled.statusCode, 401, disabled.body);
  } finally {
    if (setupUserId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: setupUserId })
        .delete();
    if (userId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: userId })
        .delete();
    await database.destroy();
    await app.close();
  }
});
