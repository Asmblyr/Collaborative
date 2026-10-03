import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, jwtVerify } from "jose";
import { oauthFixture } from "./support/oauth-provider.js";

test("OAuth issues interoperable JWTs with fixed identity, PKCE and single-use codes", async () => {
  const f = await oauthFixture();
  try {
    const discovery = await f.app.inject({
      url: "/oauth/.well-known/openid-configuration",
    });
    assert.equal(discovery.statusCode, 200, discovery.body);
    assert.equal(discovery.json().issuer, f.config.issuer);
    const jwks = await f.app.inject({ url: "/oauth/jwks" });
    assert.equal(jwks.statusCode, 200, jwks.body);
    assert.equal(jwks.json().keys[0].d, undefined);
    const flow = await f.flow();
    const consent = await flow.consent();
    assert.equal(consent.statusCode, 303, consent.body);
    const redirect = new URL(String(consent.headers.location));
    assert.equal(redirect.origin, "http://localhost:4567");
    assert.equal(redirect.searchParams.get("state"), "test-state");
    const code = redirect.searchParams.get("code")!;
    assert.ok(code, redirect.toString());
    const token = await f.exchange(code, flow.verifier);
    assert.equal(token.statusCode, 200, token.body);
    const keys = createLocalJWKSet(jwks.json());
    const verified = await jwtVerify(token.json().access_token, keys, {
      issuer: f.config.issuer,
      audience: "lavinmq",
      algorithms: ["RS256"],
    });
    assert.equal(verified.payload.sub, f.users[0]);
    assert.equal(verified.payload.email, `${f.users[0]}@example.test`);
    assert.equal(verified.payload.name, "Test User");
    assert.equal(verified.payload.picture, "https://example.test/avatar.png");
    assert.equal(verified.payload.superuser, undefined);
    assert.match(String(verified.payload.scope), /lavinmq.tag:monitoring/);
    const identity = await jwtVerify(token.json().id_token, keys, {
      issuer: f.config.issuer,
      audience: f.application.id,
    });
    assert.equal(identity.payload.nonce, "test-nonce");
    assert.equal(
      (await f.exchange(code, flow.verifier)).json().error,
      "invalid_grant",
    );
    assert.equal(
      (
        await f.app.inject({
          url: "/auth/me",
          headers: { authorization: `Bearer ${token.json().access_token}` },
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});

test("OAuth rejects missing PKCE, altered redirects, code replay races and client substitution", async () => {
  const f = await oauthFixture();
  try {
    const flow = await f.flow();
    const noPkce = new URLSearchParams(flow.query);
    noPkce.delete("code_challenge");
    const missing = await f.app.inject({ url: `/oauth/auth?${noPkce}` });
    assert.match(String(missing.headers.location), /error=invalid_request/);
    const badRedirect = new URLSearchParams(flow.query);
    badRedirect.set("redirect_uri", "https://attacker.example/callback");
    const redirect = await f.app.inject({ url: `/oauth/auth?${badRedirect}` });
    assert.equal(redirect.statusCode, 400);
    assert.equal(redirect.headers.location, undefined);
    const accepted = await flow.consent();
    const code = new URL(String(accepted.headers.location)).searchParams.get(
      "code",
    )!;
    assert.equal(
      (await f.exchange(code, "wrong".repeat(10))).json().error,
      "invalid_grant",
    );
    const concurrent = await Promise.all([
      f.exchange(code, flow.verifier),
      f.exchange(code, flow.verifier),
    ]);
    assert.equal(
      concurrent.filter((response) => response.statusCode === 200).length,
      1,
    );
    assert.equal(
      concurrent.filter((response) => response.json().error === "invalid_grant")
        .length,
      1,
    );
    const second = await f.app.inject({
      method: "POST",
      url: "/oauth-apps",
      headers: f.auth,
      payload: { ...f.input, name: "Other app" },
    });
    const fresh = await f.flow();
    const freshCode = new URL(
      String((await fresh.consent()).headers.location),
    ).searchParams.get("code")!;
    const swapped = await f.exchange(
      freshCode,
      fresh.verifier,
      second.json().data.application.id,
    );
    assert.equal(swapped.json().error, "invalid_grant");
    const expired = await f.flow();
    const expiredCode = new URL(
      String((await expired.consent()).headers.location),
    ).searchParams.get("code")!;
    await f
      .db("public.asmblyr_oauth_state")
      .where({ model: "AuthorizationCode" })
      .update({ expires_at: new Date(0) });
    assert.equal(
      (await f.exchange(expiredCode, expired.verifier)).json().error,
      "invalid_grant",
    );
  } finally {
    await f.close();
  }
});

test("OAuth checks users, consent binding, revoked membership, disabled apps and scope boundaries", async () => {
  const f = await oauthFixture();
  try {
    assert.equal(
      (await f.app.inject({ url: "/oauth-apps", headers: f.otherAuth }))
        .statusCode,
      403,
    );
    const outsider = await f.flow(
      f.application.id,
      "openid profile email",
      f.otherAuth,
    );
    assert.equal(outsider.details.json().data.allowed, false);
    assert.match(
      String((await outsider.consent()).headers.location),
      /error=access_denied/,
    );
    const switched = await f.flow();
    assert.equal(
      (await switched.consent(true, { userId: f.users[1] })).statusCode,
      400,
    );
    assert.match(
      String((await switched.consent(false)).headers.location),
      /error=access_denied/,
    );
    const elevated = await f.flow();
    const elevatedQuery = new URLSearchParams(elevated.query);
    elevatedQuery.set(
      "scope",
      "openid profile email lavinmq.tag:administrator",
    );
    const rejectedScope = await f.app.inject({
      url: `/oauth/auth?${elevatedQuery}`,
    });
    assert.match(String(rejectedScope.headers.location), /error=invalid_scope/);
    const approved = await elevated.consent();
    const code = new URL(String(approved.headers.location)).searchParams.get(
      "code",
    )!;
    await f
      .db("public.asmblyr_oauth_app_users")
      .where({ app_id: f.application.id })
      .delete();
    assert.equal(
      (await f.exchange(code, elevated.verifier)).json().error,
      "invalid_grant",
    );
    await f
      .db("public.asmblyr_oauth_app_users")
      .insert({ app_id: f.application.id, user_id: f.users[0] });
    const disabled = await f.flow();
    const disabledCode = new URL(
      String((await disabled.consent()).headers.location),
    ).searchParams.get("code")!;
    await f
      .db("public.asmblyr_oauth_apps")
      .where({ id: f.application.id })
      .update({ enabled: false });
    assert.equal(
      (await f.exchange(disabledCode, disabled.verifier)).json().error,
      "invalid_client",
    );
  } finally {
    await f.close();
  }
});

test("Confidential OIDC clients use userinfo, secret rotation, encrypted storage and revocation", async () => {
  const f = await oauthFixture();
  try {
    const created = await f.app.inject({
      method: "POST",
      url: "/oauth-apps",
      headers: f.auth,
      payload: {
        ...f.input,
        name: "Standard OIDC",
        clientType: "confidential",
        audience: "",
        scopes: [],
      },
    });
    const { application, clientSecret } = created.json().data;
    assert.ok(clientSecret);
    const listing = await f.app.inject({ url: "/oauth-apps", headers: f.auth });
    assert.equal(listing.body.includes(clientSecret), false);
    const stored = await f
      .db("public.asmblyr_oauth_apps")
      .where({ id: application.id })
      .first();
    assert.equal(stored.secret.includes(clientSecret), false);
    const flow = await f.flow(application.id, "openid profile email");
    const code = new URL(
      String((await flow.consent()).headers.location),
    ).searchParams.get("code")!;
    assert.equal(
      (await f.exchange(code, flow.verifier, application.id)).json().error,
      "invalid_client",
    );
    const response = await f.exchange(
      code,
      flow.verifier,
      application.id,
      clientSecret,
    );
    assert.equal(response.statusCode, 200, response.body);
    const token = response.json().access_token;
    const profile = await f.app.inject({
      url: "/oauth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(profile.statusCode, 200, profile.body);
    assert.deepEqual(Object.keys(profile.json()).sort(), [
      "email",
      "name",
      "picture",
      "sub",
    ]);
    const state = JSON.stringify(await f.db("public.asmblyr_oauth_state"));
    for (const sensitive of [
      code,
      token,
      flow.verifier,
      `${f.users[0]}@example.test`,
    ])
      assert.equal(state.includes(sensitive), false);
    const rotated = await f.app.inject({
      method: "POST",
      url: `/oauth-apps/${application.id}/secret`,
      headers: f.auth,
      payload: {},
    });
    assert.equal(rotated.statusCode, 200);
    assert.notEqual(rotated.json().data.clientSecret, clientSecret);
    const revoked = await f.app.inject({
      url: "/oauth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(revoked.statusCode, 401);
    const next = await f.flow(application.id, "openid profile email");
    const nextCode = new URL(
      String((await next.consent()).headers.location),
    ).searchParams.get("code")!;
    assert.equal(
      (
        await f.exchange(nextCode, next.verifier, application.id, clientSecret)
      ).json().error,
      "invalid_client",
    );
    assert.equal(
      (
        await f.exchange(
          nextCode,
          next.verifier,
          application.id,
          rotated.json().data.clientSecret,
        )
      ).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
