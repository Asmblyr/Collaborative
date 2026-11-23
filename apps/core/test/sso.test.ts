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
  assert.equal(
    providers[0].callbackUrl,
    "http://localhost:3000/sign/sso/okkam/callback",
  );
  assert.equal(
    providers[1].callbackUrl,
    "http://localhost:3000/sign/sso/personal/callback",
  );
  assert.equal(providers[0].issuer, "https://gitlab.com");
  assert.equal(providers[1].clientId, "second");
  assert.deepEqual(ssoFromEnv({}), []);
  for (const key of [
    "OKKAM",
    "okkam,okkam",
    "okkam,",
    "../okkam",
    "okkam-test",
  ]) {
    assert.throws(() => ssoFromEnv({ ...env, AUTH_PROVIDERS: key }));
  }
  assert.throws(() =>
    ssoFromEnv({ ...env, AUTH_UI_URL: "http://admin.example.com" }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...env, AUTH_OKKAM_ISSUER_URL: "http://gitlab.com" }),
  );
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
  assert.equal(
    safeReturnTo("/items/shops/4?tab=data"),
    "/items/shops/4?tab=data",
  );
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
  for (const fault of [
    undefined,
    "nonce",
    "issuer",
    "audience",
    "expiry",
    "signature",
  ]) {
    const proof = newProof();
    const url = await protocol.authorize(fake.provider, proof);
    const query = fake.authorize(url, "stable-id", fault);
    if (fault) {
      await assert.rejects(protocol.verify(fake.provider, proof, query), {
        code: "SSO_AUTH_FAILED",
      });
    } else {
      const verified = await protocol.verify(fake.provider, proof, query);
      assert.deepEqual(verified.identity, {
        provider: "okkam",
        issuer: fake.provider.issuer,
        subject: "stable-id",
      });
      assert.equal(verified.profile.email, "same@example.test");
      assert.equal(verified.profile.emailVerified, true);
    }
  }
  const proof = newProof();
  const query = fake.authorize(await protocol.authorize(fake.provider, proof));
  const altered = new URLSearchParams(query);
  altered.set("state", "wrong");
  await assert.rejects(
    protocol.verify(fake.provider, proof, altered.toString()),
  );
});

test("OAuth2 verifies PKCE and maps the configured stable profile ID and custom profile fields", async () => {
  const fake = await fakeSsoProvider({
    driver: "oauth2",
    env: {
      AUTH_OKKAM_EMAIL_KEY: "contact.mail",
      AUTH_OKKAM_EMAIL_VERIFIED_KEY: "contact.verified",
      AUTH_OKKAM_FIRST_NAME_KEY: "profile.first",
      AUTH_OKKAM_LAST_NAME_KEY: "profile.last",
      AUTH_OKKAM_DISPLAY_NAME_KEY: "profile.full_name",
    },
  });
  const protocol = new SsoProtocol(fake.transport);
  const proof = newProof();
  const url = await protocol.authorize(fake.provider, proof);
  assert.equal(new URL(url).searchParams.has("nonce"), false);
  const verified = await protocol.verify(
    fake.provider,
    proof,
    fake.authorize(url, {
      subject: "12345",
      oauth2Profile: {
        account: { id: "12345" },
        contact: { mail: "  Alice@Corp.Example ", verified: true },
        profile: {
          first: "Alice",
          last: "Smith",
          full_name: "Alice Smith",
        },
      },
    }),
  );
  assert.equal(verified.identity.subject, "12345");
  assert.equal(verified.identity.issuer, fake.provider.issuer);
  assert.deepEqual(verified.profile, {
    email: "alice@corp.example",
    emailVerified: true,
    firstName: "Alice",
    lastName: "Smith",
    displayName: "Alice Smith",
  });
});

test("OIDC and OAuth2 support client_secret_post without an Authorization header", async () => {
  for (const driver of ["openid", "oauth2"] as const) {
    const fake = await fakeSsoProvider(driver, "client_secret_post");
    const protocol = new SsoProtocol(fake.transport);
    const proof = newProof();
    const url = await protocol.authorize(fake.provider, proof);
    const verified = await protocol.verify(
      fake.provider,
      proof,
      fake.authorize(url, "post-user"),
    );
    assert.equal(verified.identity.subject, "post-user");
  }
});

test("SSO config defaults auto-link and JIT off and validates domains, policies, booleans, and OAuth2 keys", () => {
  const base = {
    AUTH_PROVIDERS: "corp",
    AUTH_UI_URL: "http://localhost:3000",
    AUTH_CORP_DRIVER: "openid",
    AUTH_CORP_ISSUER_URL: "https://idp.example.test",
    AUTH_CORP_CLIENT_ID: "client-id",
    AUTH_CORP_CLIENT_SECRET: "client-secret",
  };
  const [defaults] = ssoFromEnv(base);
  assert.equal(defaults.autoLinkByEmail, false);
  assert.equal(defaults.autoProvision, false);
  assert.equal(defaults.requireVerifiedEmail, true);
  assert.deepEqual(defaults.allowedEmailDomains, []);
  assert.deepEqual(defaults.defaultPolicies, []);

  const [configured] = ssoFromEnv({
    ...base,
    AUTH_CORP_AUTO_LINK_BY_EMAIL: "true",
    AUTH_CORP_AUTO_PROVISION: "TRUE",
    AUTH_CORP_REQUIRE_VERIFIED_EMAIL: "false",
    AUTH_CORP_ALLOWED_EMAIL_DOMAINS:
      "Corp.Example, sub.corp.example, corp.example",
    AUTH_CORP_DEFAULT_POLICIES: "Employees, Readers, Employees",
  });
  assert.equal(configured.autoLinkByEmail, true);
  assert.equal(configured.autoProvision, true);
  assert.equal(configured.requireVerifiedEmail, false);
  assert.deepEqual(configured.allowedEmailDomains, [
    "corp.example",
    "sub.corp.example",
  ]);
  assert.deepEqual(configured.defaultPolicies, ["Employees", "Readers"]);

  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_AUTO_LINK_BY_EMAIL: "yes" }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_ALLOWED_EMAIL_DOMAINS: "@corp.example" }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_ALLOWED_EMAIL_DOMAINS: "*.corp.example" }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_ALLOWED_EMAIL_DOMAINS: "corp.example," }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_DEFAULT_POLICIES: "Employees," }),
  );
  assert.throws(() =>
    ssoFromEnv({
      ...base,
      AUTH_CORP_DRIVER: "oauth2",
      AUTH_CORP_AUTHORIZE_URL: "https://idp.example.test/authorize",
      AUTH_CORP_ACCESS_URL: "https://idp.example.test/token",
      AUTH_CORP_PROFILE_URL: "https://idp.example.test/profile",
      AUTH_CORP_EMAIL_KEY: "bad-key!",
    }),
  );
});

test("OIDC fetches userinfo when id_token is minimal and rejects userinfo subject mismatch", async () => {
  const fake = await fakeSsoProvider({
    driver: "openid",
    advertiseUserInfo: true,
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
    },
  });
  const protocol = new SsoProtocol(fake.transport);

  const proof = newProof();
  const url = await protocol.authorize(fake.provider, proof);
  const verified = await protocol.verify(
    fake.provider,
    proof,
    fake.authorize(url, {
      subject: "min-user",
      idTokenClaims: {},
      userInfo: {
        sub: "min-user",
        email: "Minimal@Corp.Example",
        email_verified: true,
        given_name: "Ivan",
        family_name: "Petrov",
        name: "Ivan Petrov",
      },
    }),
    { fetchProfile: true },
  );
  assert.equal(fake.userInfoCalls(), 1);
  assert.deepEqual(verified.profile, {
    email: "minimal@corp.example",
    emailVerified: true,
    firstName: "Ivan",
    lastName: "Petrov",
    displayName: "Ivan Petrov",
  });

  // Skip userinfo during explicit account linking
  const linkProof = newProof();
  const linkUrl = await protocol.authorize(fake.provider, linkProof);
  await protocol.verify(
    fake.provider,
    linkProof,
    fake.authorize(linkUrl, { subject: "min-user", idTokenClaims: {} }),
    { fetchProfile: false },
  );
  assert.equal(fake.userInfoCalls(), 1);

  // Reject mismatched sub in userinfo response
  const mismatchProof = newProof();
  const mismatchUrl = await protocol.authorize(fake.provider, mismatchProof);
  await assert.rejects(
    protocol.verify(
      fake.provider,
      mismatchProof,
      fake.authorize(mismatchUrl, {
        subject: "expected-sub",
        idTokenClaims: {},
        userInfo: {
          sub: "different-sub",
          email: "spoof@corp.example",
          email_verified: true,
        },
      }),
      { fetchProfile: true },
    ),
    { code: "SSO_AUTH_FAILED" },
  );
});

test("SSO diagnostics retain safe protocol codes without leaking messages, tokens or bodies", () => {
  const error = {
    code: "OAUTH_WWW_AUTHENTICATE_CHALLENGE",
    status: 401,
    message: "secret-in-message",
    response: { access_token: "secret-in-response" },
    cause: [
      {
        parameters: {
          error: "invalid_client",
          error_description: "secret-in-description",
        },
      },
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
  assert.equal(
    JSON.stringify(unknown),
    '{"provider":"okkam","phase":"verify"}',
  );
});
