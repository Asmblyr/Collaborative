import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";

export async function oauthFixture(
  options: { issuer?: string; redirectUri?: string } = {},
) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const config = {
    issuer: options.issuer ?? "http://localhost:3000/oauth",
    cookieKeys: [randomBytes(32).toString("base64url")],
    storageKey: randomBytes(32).toString("base64url"),
    jwks: {
      keys: [
        {
          ...(await exportJWK(privateKey)),
          kid: "test-rsa",
          alg: "RS256",
          use: "sig",
        },
      ],
    },
  };
  let app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    oauth: config,
  });
  const users = [randomUUID(), randomUUID()];
  await db("public.asmblyr_users").insert(
    users.map((id, index) => ({
      id,
      email: `${id}@example.test`,
      display_name: "Test User",
      picture_url: "https://example.test/avatar.png",
      superuser: index === 0,
    })),
  );
  const tokens = await Promise.all(users.map((id) => issueUserTokens(db, id)));
  const auth = { authorization: `Bearer ${tokens[0].accessToken}` };
  const otherAuth = { authorization: `Bearer ${tokens[1].accessToken}` };
  const input = {
    name: "Test app",
    description: "OIDC test",
    enabled: true,
    clientType: "public",
    redirectUris: [
      options.redirectUri ?? "http://localhost:4567/oauth/callback",
    ],
    userIds: [users[0]],
    audience: "lavinmq",
    scopes: ["lavinmq.tag:monitoring", "lavinmq.read:%2F/*"],
  };
  const created = await app.inject({
    method: "POST",
    url: "/oauth-apps",
    headers: auth,
    payload: input,
  });
  assert.equal(created.statusCode, 201, created.body);
  const application = created.json().data.application;

  async function flow(
    clientId = application.id,
    scope = "openid profile email lavinmq.tag:monitoring lavinmq.read:%2F/*",
    headers = auth,
    parameters: Record<string, string> = {},
    jar = new Map<string, string>(),
  ) {
    function cookies() {
      return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    }
    function remember(response: Awaited<ReturnType<typeof app.inject>>) {
      const setCookies = response.headers["set-cookie"];
      for (const cookie of !setCookies
        ? []
        : Array.isArray(setCookies)
          ? setCookies
          : [setCookies]) {
        const [pair] = cookie.split(";");
        const i = pair.indexOf("=");
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
    }
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUris[0],
      response_type: "code",
      scope,
      state: "test-state",
      nonce: "test-nonce",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...parameters,
    });
    const start = await app.inject({
      url: `/oauth/auth?${query}`,
      headers: { cookie: cookies() },
    });
    remember(start);
    assert.equal(start.statusCode, 303, start.body);
    const location = new URL(String(start.headers.location));
    const uid = location.pathname.split("/").at(-1)!;
    const details = await app.inject({
      url: `/oauth-interactions/${uid}`,
      headers: { ...headers, cookie: cookies() },
    });
    assert.equal(details.statusCode, 200, details.body);
    async function decision(
      approve = true,
      overrides = {},
      currentHeaders = headers,
    ) {
      return app.inject({
        method: "POST",
        url: `/oauth-interactions/${uid}`,
        headers: { ...currentHeaders, cookie: cookies() },
        payload: { approve, userId: details.json().data.userId, ...overrides },
      });
    }
    async function resume(redirectTo: string) {
      const resumeUrl = new URL(redirectTo);
      const response = await app.inject({
        url: resumeUrl.pathname + resumeUrl.search,
        headers: { cookie: cookies() },
      });
      remember(response);
      return response;
    }
    async function consent(
      approve = true,
      overrides = {},
      currentHeaders = headers,
    ) {
      const response = await decision(approve, overrides, currentHeaders);
      if (response.statusCode !== 200) return response;
      return resume(response.json().data.redirectTo);
    }
    return { verifier, query, start, details, consent, decision, resume, jar };
  }
  function exchange(
    code: string,
    verifier: string,
    clientId = application.id,
    secret?: string,
  ) {
    return app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(secret
          ? {
              authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
            }
          : {}),
      },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: input.redirectUris[0],
      }).toString(),
    });
  }
  async function close() {
    await app.close();
    await db("public.asmblyr_oauth_state").delete();
    await db("public.asmblyr_oauth_apps").delete();
    await db("public.asmblyr_security_events")
      .whereIn("actor_id", users)
      .delete();
    await db("public.asmblyr_users").whereIn("id", users).delete();
    await db.destroy();
  }
  async function restart() {
    await app.close();
    app = createApp({
      databaseUrl: process.env.DATABASE_URL,
      logger: false,
      oauth: config,
    });
  }
  return {
    get app() {
      return app;
    },
    db,
    config,
    users,
    auth,
    otherAuth,
    input,
    application,
    flow,
    exchange,
    close,
    restart,
  };
}
