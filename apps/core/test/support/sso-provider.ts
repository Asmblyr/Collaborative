import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ssoFromEnv } from "../../src/auth/sso/config.js";

export interface FakeSsoOptions {
  driver?: "openid" | "oauth2";
  clientAuth?: "client_secret_basic" | "client_secret_post";
  env?: Record<string, string | undefined>;
  advertiseUserInfo?: boolean;
}

export interface FakeAuthorizeOptions {
  subject?: string;
  fault?: string;
  idTokenClaims?: Record<string, unknown>;
  userInfo?: Record<string, unknown>;
  userInfoStatus?: number;
  oauth2Profile?: Record<string, unknown>;
}

export async function fakeSsoProvider(
  driverOrOptions: "openid" | "oauth2" | FakeSsoOptions = "openid",
  clientAuthArg:
    | "client_secret_basic"
    | "client_secret_post" = "client_secret_basic",
) {
  const options: FakeSsoOptions =
    typeof driverOrOptions === "string"
      ? { driver: driverOrOptions, clientAuth: clientAuthArg }
      : driverOrOptions;
  const driver = options.driver ?? "openid";
  const clientAuth = options.clientAuth ?? "client_secret_basic";
  const issuer = "https://identity.example.test";
  const provider = ssoFromEnv({
    AUTH_PROVIDERS: "okkam",
    AUTH_UI_URL: "http://localhost:3000",
    AUTH_OKKAM_DRIVER: driver,
    AUTH_OKKAM_LABEL: "Test GitLab",
    AUTH_OKKAM_ISSUER_URL: issuer,
    AUTH_OKKAM_CLIENT_ID: "test-client",
    AUTH_OKKAM_CLIENT_SECRET: "test-secret",
    AUTH_OKKAM_CLIENT_AUTH_METHOD: clientAuth,
    AUTH_OKKAM_AUTHORIZE_URL: `${issuer}/authorize`,
    AUTH_OKKAM_ACCESS_URL: `${issuer}/token`,
    AUTH_OKKAM_PROFILE_URL: `${issuer}/profile`,
    AUTH_OKKAM_IDENTIFIER_KEY: "account.id",
    ...options.env,
  })[0];

  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  const codes = new Map<
    string,
    {
      nonce: string;
      challenge: string;
      subject: string;
      fault?: string;
      idTokenClaims?: Record<string, unknown>;
      userInfo?: Record<string, unknown>;
      userInfoStatus?: number;
      oauth2Profile?: Record<string, unknown>;
    }
  >();
  const tokenProfiles = new Map<
    string,
    {
      subject: string;
      userInfo?: Record<string, unknown>;
      userInfoStatus?: number;
      oauth2Profile?: Record<string, unknown>;
    }
  >();
  let exchanges = 0;
  let userInfoCalls = 0;

  function authorize(
    url: string,
    subjectOrOptions: string | FakeAuthorizeOptions = "external-user",
    fault?: string,
  ): string {
    const authOptions: FakeAuthorizeOptions =
      typeof subjectOrOptions === "string"
        ? { subject: subjectOrOptions, fault }
        : subjectOrOptions;
    const parameters = new URL(url).searchParams;
    assert.equal(parameters.get("redirect_uri"), provider.callbackUrl);
    assert.equal(parameters.get("code_challenge_method"), "S256");
    const code = randomUUID();
    codes.set(code, {
      nonce: parameters.get("nonce") ?? "",
      challenge: parameters.get("code_challenge")!,
      subject: authOptions.subject ?? "external-user",
      fault: authOptions.fault,
      idTokenClaims: authOptions.idTokenClaims,
      userInfo: authOptions.userInfo,
      userInfoStatus: authOptions.userInfoStatus,
      oauth2Profile: authOptions.oauth2Profile,
    });
    return new URLSearchParams({
      code,
      state: parameters.get("state")!,
      iss: issuer,
    }).toString();
  }

  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/.well-known/openid-configuration") {
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        ...(options.advertiseUserInfo
          ? { userinfo_endpoint: `${issuer}/userinfo` }
          : {}),
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/keys") {
      return Response.json({ keys: [jwk] });
    }
    if (url.pathname === "/userinfo") {
      userInfoCalls++;
      const authHeader = new Headers(init?.headers).get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
      const entry = tokenProfiles.get(token);
      assert.ok(entry, "valid userinfo bearer token");
      if (entry.userInfoStatus && entry.userInfoStatus >= 400) {
        return new Response("userinfo error", { status: entry.userInfoStatus });
      }
      return Response.json(
        entry.userInfo ?? {
          sub: entry.subject,
          email: "same@example.test",
          email_verified: true,
        },
      );
    }
    if (url.pathname === "/profile") {
      const authHeader = new Headers(init?.headers).get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
      const entry = tokenProfiles.get(token);
      assert.ok(entry, "valid oauth2 bearer token");
      return Response.json(
        entry.oauth2Profile ?? {
          account: { id: entry.subject },
          email: "same@example.test",
          email_verified: true,
        },
      );
    }
    if (url.pathname !== "/token") {
      throw new Error(`Unexpected provider request: ${url.pathname}`);
    }
    exchanges++;
    const body = new URLSearchParams(String(init?.body));
    const authorization = new Headers(init?.headers).get("authorization");
    if (clientAuth === "client_secret_post") {
      assert.equal(authorization, null);
      assert.equal(body.get("client_id"), "test-client");
      assert.equal(body.get("client_secret"), "test-secret");
    } else {
      assert.ok(authorization?.startsWith("Basic "));
      const credentials = authorization.slice("Basic ".length);
      assert.equal(
        decodeURIComponent(Buffer.from(credentials, "base64").toString()),
        "test-client:test-secret",
      );
      assert.equal(body.has("client_secret"), false);
    }
    const code = body.get("code")!;
    const pending = codes.get(code);
    codes.delete(code);
    assert.ok(pending, "single-use authorization code");
    assert.equal(body.get("redirect_uri"), provider.callbackUrl);
    assert.equal(
      createHash("sha256")
        .update(body.get("code_verifier")!)
        .digest("base64url"),
      pending.challenge,
    );
    const accessToken = `provider-token-${exchanges}`;
    tokenProfiles.set(accessToken, {
      subject: pending.subject,
      userInfo: pending.userInfo,
      userInfoStatus: pending.userInfoStatus,
      oauth2Profile: pending.oauth2Profile,
    });
    if (driver === "oauth2") {
      return Response.json({
        access_token: accessToken,
        token_type: "Bearer",
      });
    }
    const claims: Record<string, unknown> = {
      nonce: pending.fault === "nonce" ? "wrong" : pending.nonce,
      ...(pending.idTokenClaims ?? {
        email: "same@example.test",
        email_verified: true,
      }),
    };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(
        pending.fault === "issuer" ? "https://wrong.example.test" : issuer,
      )
      .setAudience(pending.fault === "audience" ? "wrong" : provider.clientId)
      .setSubject(pending.subject)
      .setIssuedAt()
      .setExpirationTime(
        pending.fault === "expiry" ? Math.floor(Date.now() / 1000) - 120 : "5m",
      )
      .sign(pending.fault === "signature" ? other.privateKey : privateKey);
    return Response.json({
      access_token: accessToken,
      token_type: "Bearer",
      id_token: token,
    });
  };
  return {
    provider,
    transport,
    authorize,
    exchanges: () => exchanges,
    userInfoCalls: () => userInfoCalls,
  };
}
