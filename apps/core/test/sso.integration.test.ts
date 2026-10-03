import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { SsoService } from "../src/auth/sso/service.js";
import { SsoProtocol } from "../src/auth/sso/protocol.js";
import { fakeSsoProvider } from "./support/sso-provider.js";

test("SSO routes link explicitly, reject replay and cross-account access, preserve permissions and guard last identity", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const fake = await fakeSsoProvider();
  const sso = new SsoService([fake.provider], new SsoProtocol(fake.transport));
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false, sso });
  const ids = [randomUUID(), randomUUID()];
  await database("public.asmblyr_users").insert(
    ids.map((id, index) => ({
      id,
      email: index ? `${id}@example.test` : "same@example.test",
      superuser: false,
    })),
  );
  const [session, other] = await Promise.all(ids.map((id) => issueUserTokens(database, id)));
  const auth = { authorization: `Bearer ${session.accessToken}` };
  const otherAuth = { authorization: `Bearer ${other.accessToken}` };

  async function start(intent: "link" | "login", headers = auth, subject = "person-1") {
    const browserToken = randomBytes(32).toString("base64url");
    const response = await app.inject({
      method: "POST",
      url: "/auth/sso/okkam/start",
      headers,
      payload: {
        browserToken,
        intent,
        returnTo: "/items/shops/4",
        uiOrigin: "http://localhost:3000",
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    return { browserToken, query: fake.authorize(response.json().authorizationUrl, subject) };
  }
  function complete(payload: { browserToken: string; query: string }, headers = auth) {
    return app.inject({ method: "POST", url: "/auth/sso/okkam/callback", headers, payload });
  }
  try {
    const providers = await app.inject({ method: "GET", url: "/auth/providers" });
    assert.deepEqual(providers.json().data, [
      { id: "okkam", label: "Test GitLab", driver: "openid" },
    ]);
    assert.equal(providers.body.includes("test-secret"), false);
    const notLinked = await complete(await start("login"));
    assert.equal(notLinked.json().code, "SSO_NOT_LINKED", notLinked.body);
    assert.equal((await database("public.asmblyr_user_identities")).length, 0);
    assert.equal((await database("public.asmblyr_users").whereIn("id", ids)).length, 2);

    const unsigned = await app.inject({
      method: "POST",
      url: "/auth/sso/okkam/start",
      payload: { browserToken: "b".repeat(43), intent: "link", uiOrigin: "http://localhost:3000" },
    });
    assert.equal(unsigned.statusCode, 401);
    const origin = await app.inject({
      method: "POST",
      url: "/auth/sso/okkam/start",
      headers: auth,
      payload: { browserToken: "b".repeat(43), intent: "link", uiOrigin: "https://evil.test" },
    });
    assert.equal(origin.json().code, "SSO_WRONG_ORIGIN");

    const link = await start("link");
    assert.equal((await complete(link, otherAuth)).json().code, "SSO_INVALID_FLOW");
    const beforeExchange = fake.exchanges();
    assert.equal(
      (await complete({ ...link, browserToken: "z".repeat(43) })).json().code,
      "SSO_INVALID_FLOW",
    );
    assert.equal(fake.exchanges(), beforeExchange);
    const linked = await complete(link);
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().intent, "link");
    assert.equal(linked.json().tokens, undefined);
    assert.equal((await complete(link)).json().code, "SSO_INVALID_FLOW");
    assert.equal(
      (await complete(await start("link", otherAuth), otherAuth)).json().code,
      "SSO_IDENTITY_CONFLICT",
    );

    const login = await start("login");
    const results = await Promise.all([complete(login), complete(login)]);
    assert.equal(results.filter((response) => response.statusCode === 200).length, 1);
    const tokens = results.find((response) => response.statusCode === 200)!.json().tokens;
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    assert.equal(me.json().data.id, ids[0]);
    assert.equal(me.json().data.superuser, false);
    assert.equal(me.json().data.email, "same@example.test");
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/refresh",
          payload: { refreshToken: tokens.refreshToken },
        })
      ).statusCode,
      200,
    );

    const expired = await start("login");
    await database("public.asmblyr_auth_flows").update({ expires_at: new Date(Date.now() - 1000) });
    assert.equal((await complete(expired)).json().code, "SSO_INVALID_FLOW");
    await database("public.asmblyr_users").where({ id: ids[0] }).update({ status: "disabled" });
    assert.equal((await complete(await start("login"))).json().code, "SSO_AUTH_FAILED");
    await database("public.asmblyr_users").where({ id: ids[0] }).update({ status: "active" });

    const list = await app.inject({ method: "GET", url: "/users/me/identities", headers: auth });
    assert.equal(list.json().data.length, 1);
    const identityId = list.json().data[0].id;
    const remove = (headers = auth) =>
      app.inject({ method: "DELETE", url: `/users/me/identities/${identityId}`, headers });
    assert.equal((await remove(otherAuth)).json().code, "SSO_NOT_LINKED");
    assert.equal((await remove()).json().code, "SSO_LAST_IDENTITY");
    await database("public.asmblyr_password_credentials").insert({
      user_id: ids[0],
      password_hash: "unused-in-test",
    });
    assert.equal((await remove()).statusCode, 204);
    assert.equal((await complete(await start("login"))).json().code, "SSO_NOT_LINKED");
    const audit = await database("public.asmblyr_security_events").where({ actor_id: ids[0] });
    assert.ok(audit.some((row) => row.action === "user.identity_linked"));
    assert.ok(audit.some((row) => row.action === "user.sso_login"));
    assert.ok(audit.some((row) => row.action === "user.identity_unlinked"));
    assert.equal(JSON.stringify(audit).includes("provider-token"), false);
  } finally {
    await database("public.asmblyr_auth_flows").delete();
    await database("public.asmblyr_users").whereIn("id", ids).delete();
    await app.close();
    await database.destroy();
  }
});
