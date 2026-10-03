import assert from "node:assert/strict";
import test from "node:test";
import { ssoFromEnv } from "../src/auth/sso/config.js";
import { newProof } from "../src/auth/sso/flows.js";
import { parseSsoCallback, safeReturnTo } from "../src/auth/sso/input.js";
import { SsoProtocol } from "../src/auth/sso/protocol.js";
import { fakeSsoProvider } from "./support/sso-provider.js";
import { ssoDiagnostic } from "../src/auth/sso/diagnostics.js";

test("provider keys are explicit, multiple providers are independent, secrets stay server-side", () => {
  const env = {
    AUTH_PROVIDERS: "okkam,personal",
    AUTH_UI_URL: "http://localhost:3000",
    AUTH_OKKAM_DRIVER: "openid",
    AUTH_OKKAM_ISSUER_URL: "https://gitlab.com",
    AUTH_OKKAM_CLIENT_ID: "first",
    AUTH_OKKAM_CLIENT_SECRET: "first-secret",
    AUTH_PERSONAL_DRIVER: "openid",
    AUTH_PERSONAL_ISSUER_URL: "https://gitlab.com",
    AUTH_PERSONAL_CLIENT_ID: "second",
    AUTH_PERSONAL_CLIENT_SECRET: "second-secret",
  };
  const providers = ssoFromEnv(env);
  assert.equal(providers[0].callbackUrl, "http://localhost:3000/sign/sso/okkam/callback");
  assert.equal(providers[1].callbackUrl, "http://localhost:3000/sign/sso/personal/callback");
  assert.equal(providers[0].issuer, "https://gitlab.com");
  assert.equal(providers[1].clientId, "second");
  assert.deepEqual(ssoFromEnv({}), []);
  for (const key of ["OKKAM", "okkam,okkam", "okkam,", "../okkam", "okkam-test"]) {
    assert.throws(() => ssoFromEnv({ ...env, AUTH_PROVIDERS: key }));
  }
  assert.throws(() => ssoFromEnv({ ...env, AUTH_UI_URL: "http://admin.example.com" }));
  assert.throws(() => ssoFromEnv({ ...env, AUTH_OKKAM_ISSUER_URL: "http://gitlab.com" }));
  assert.throws(() => ssoFromEnv({ ...env, AUTH_OKKAM_CLIENT_SECRET: "" }));
});

test("SSO input blocks open redirects and duplicate callback parameters", () => {
  for (const target of [
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/\nevil.test",
    "/a/..//evil.test",
  ]) {
    assert.equal(safeReturnTo(target), "/");
  }
  assert.equal(safeReturnTo("/items/shops/4?tab=data"), "/items/shops/4?tab=data");
  assert.throws(() =>
    parseSsoCallback({
      browserToken: "b".repeat(43),
      query: `state=${"s".repeat(43)}&state=other`,
    }),
  );
});

test("OIDC validates signed identity and rejects nonce, issuer, audience, expiry and signature attacks", async () => {
  const fake = await fakeSsoProvider();
  const protocol = new SsoProtocol(fake.transport);
  for (const fault of [undefined, "nonce", "issuer", "audience", "expiry", "signature"]) {
    const proof = newProof();
    const url = await protocol.authorize(fake.provider, proof);
    const query = fake.authorize(url, "stable-id", fault);
    if (fault) {
      await assert.rejects(protocol.verify(fake.provider, proof, query), {
        code: "SSO_AUTH_FAILED",
      });
    } else {
      assert.deepEqual(await protocol.verify(fake.provider, proof, query), {
        provider: "okkam",
        issuer: fake.provider.issuer,
        subject: "stable-id",
      });
    }
  }
  const proof = newProof();
  const query = fake.authorize(await protocol.authorize(fake.provider, proof));
  const altered = new URLSearchParams(query);
  altered.set("state", "wrong");
  await assert.rejects(protocol.verify(fake.provider, proof, altered.toString()));
});

test("OAuth2 verifies PKCE and maps the configured stable profile ID", async () => {
  const fake = await fakeSsoProvider("oauth2");
  const protocol = new SsoProtocol(fake.transport);
  const proof = newProof();
  const url = await protocol.authorize(fake.provider, proof);
  assert.equal(new URL(url).searchParams.has("nonce"), false);
  const identity = await protocol.verify(fake.provider, proof, fake.authorize(url, "12345"));
  assert.equal(identity.subject, "12345");
  assert.equal(identity.issuer, fake.provider.issuer);
});

test("OIDC and OAuth2 support client_secret_post without an Authorization header", async () => {
  for (const driver of ["openid", "oauth2"] as const) {
    const fake = await fakeSsoProvider(driver, "client_secret_post");
    const protocol = new SsoProtocol(fake.transport);
    const proof = newProof();
    const url = await protocol.authorize(fake.provider, proof);
    const identity = await protocol.verify(fake.provider, proof, fake.authorize(url, "post-user"));
    assert.equal(identity.subject, "post-user");
  }
});

test("SSO diagnostics retain safe protocol codes without leaking messages, tokens or bodies", () => {
  const error = {
    code: "OAUTH_WWW_AUTHENTICATE_CHALLENGE",
    status: 401,
    message: "secret-in-message",
    response: { access_token: "secret-in-response" },
    cause: [
      { parameters: { error: "invalid_client", error_description: "secret-in-description" } },
    ],
  };
  const diagnostic = ssoDiagnostic("okkam", "verify", error);
  assert.equal(diagnostic.oauthError, "invalid_client");
  assert.equal(diagnostic.status, 401);
  assert.equal(diagnostic.code, "OAUTH_WWW_AUTHENTICATE_CHALLENGE");
  assert.equal(JSON.stringify(diagnostic).includes("secret"), false);
  const unknown = ssoDiagnostic("okkam", "verify", {
    code: "secret-code",
    error: "secret-error",
    cause: { attribute: "secret-attribute" },
  });
  assert.equal(JSON.stringify(unknown), '{"provider":"okkam","phase":"verify"}');
});
