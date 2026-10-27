import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import {
  authorize,
  injectedFetch,
  resource,
  sdk,
} from "./support/external-mcp-client.js";

test("official SDK discovers OAuth, dynamically registers, obtains consent and exchanges PKCE", async (t) => {
  const fixture = await mcpFixture(t);
  let clientInformation: OAuthClientInformationMixed | undefined;
  let tokens: OAuthTokens | undefined;
  let verifier = "";
  let authorizationUrl: URL | undefined;
  const provider: OAuthClientProvider = {
    redirectUrl: "http://127.0.0.1:43211/callback",
    clientMetadata: {
      client_name: "Official SDK OAuth client",
      redirect_uris: ["http://127.0.0.1:43211/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    state: () => "sdk-state",
    clientInformation: () => clientInformation,
    saveClientInformation: (value) => {
      clientInformation = value;
    },
    tokens: () => tokens,
    saveTokens: (value) => {
      tokens = value;
    },
    codeVerifier: () => verifier,
    saveCodeVerifier: (value) => {
      verifier = value;
    },
    redirectToAuthorization: (value) => {
      authorizationUrl = value;
    },
  };
  const fetchFn = injectedFetch(fixture);
  assert.equal(
    await auth(provider, { serverUrl: resource, fetchFn }),
    "REDIRECT",
  );
  assert.ok(authorizationUrl);
  const start = await fixture.app.inject({
    url: authorizationUrl.pathname + authorizationUrl.search,
  });
  assert.equal(start.statusCode, 302, start.body);
  const request = new URL(start.headers.location!).searchParams.get("request");
  const collection = await fixture
    .db("asmblyr_collections")
    .where({ name: fixture.names.posts })
    .first("id");
  const decision = await fixture.app.inject({
    method: "POST",
    url: `/mcp/authorizations/${request}`,
    headers: fixture.headers,
    payload: { approved: true, write: false, collectionIds: [collection.id] },
  });
  assert.equal(decision.statusCode, 200, decision.body);
  const callback = new URL(decision.json().data.redirectUri);
  assert.equal(callback.searchParams.get("state"), "sdk-state");
  assert.equal(
    await auth(provider, {
      serverUrl: resource,
      fetchFn,
      authorizationCode: callback.searchParams.get("code")!,
    }),
    "AUTHORIZED",
  );
  assert.ok(tokens?.access_token);
  const client = await sdk(fixture, tokens.access_token);
  assert.equal((await client.client.listTools()).tools.length, 7);
  await client.client.close();
  const origin = { origin: "https://unregistered.example" };
  const challenge = await fixture.app.inject({
    url: "/mcp",
    headers: { ...origin, authorization: "Bearer none" },
  });
  assert.equal(challenge.statusCode, 401);
  assert.equal(challenge.headers["access-control-allow-origin"], "*");
  assert.equal(
    (
      await fixture.app.inject({
        method: "OPTIONS",
        url: "/mcp",
        headers: origin,
      })
    ).statusCode,
    204,
  );
  const denied = await fixture.app.inject({
    method: "POST",
    url: "/mcp",
    headers: { ...origin, authorization: `Bearer ${tokens.access_token}` },
    payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  assert.equal(denied.statusCode, 403);
});

test("MCP OAuth binds PKCE/resource/client, rotates refresh tokens, rejects replay and loses access with the parent session", async (t) => {
  const fixture = await mcpFixture(t);
  const { app, db, headers, access } = fixture;
  const metadata = await app.inject({
    url: "/.well-known/oauth-protected-resource/api/mcp",
  });
  assert.equal(metadata.json().resource, resource);
  const unauthorized = await app.inject({ url: "/mcp", headers });
  assert.equal(unauthorized.statusCode, 401);
  assert.match(
    String(unauthorized.headers["www-authenticate"]),
    /resource_metadata=/,
  );
  const auth = await authorize(fixture);
  assert.equal(auth.tokens.scope, "mcp:read");
  const external = await sdk(fixture, auth.tokens.access_token);
  assert.ok(
    !(await external.client.listTools()).tools.some(
      (tool) => tool.name === "create_item",
    ),
  );
  await external.client.close();
  const refresh = {
    grant_type: "refresh_token",
    refresh_token: auth.tokens.refresh_token,
    client_id: auth.clientId,
    resource,
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/mcp/oauth/token",
        payload: { ...refresh, resource: "https://wrong.example/api/mcp" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/mcp/oauth/token",
        payload: { ...refresh, client_id: randomUUID() },
      })
    ).statusCode,
    400,
  );
  const rotated = await app.inject({
    method: "POST",
    url: "/mcp/oauth/token",
    payload: refresh,
  });
  assert.equal(rotated.statusCode, 200, rotated.body);
  assert.notEqual(rotated.json().refresh_token, refresh.refresh_token);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/mcp/oauth/token",
        payload: refresh,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: "/mcp",
        headers: { authorization: `Bearer ${rotated.json().access_token}` },
      })
    ).statusCode,
    401,
  );
  const second = await authorize(fixture);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/mcp/oauth/token",
        payload: {
          ...second.codeInput,
          code_verifier: randomBytes(32).toString("base64url"),
        },
      })
    ).statusCode,
    400,
  );
  await db("asmblyr_auth_sessions")
    .where({
      id: access.principal.kind === "user" ? access.principal.sessionId : "",
    })
    .update({ revoked_at: db.fn.now() });
  assert.equal(
    (
      await app.inject({
        url: "/mcp",
        headers: { authorization: `Bearer ${second.tokens.access_token}` },
      })
    ).statusCode,
    401,
  );
  const unsafe = await app.inject({
    method: "POST",
    url: "/mcp/oauth/register",
    payload: {
      client_name: "unsafe",
      redirect_uris: ["http://evil.example/callback"],
    },
  });
  assert.equal(unsafe.statusCode, 400);
});
