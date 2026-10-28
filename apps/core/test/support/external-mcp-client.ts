import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { mcpFixture } from "./assistant-mcp-fixture.js";
export const resource = "http://localhost:3000/api/mcp";
type Fixture = Awaited<ReturnType<typeof mcpFixture>>;

export async function authorize(fixture: Fixture, write = false) {
  const { app, headers } = fixture;
  const register = await app.inject({
    method: "POST",
    url: "/mcp/oauth/register",
    payload: {
      client_name: "MCP test client",
      redirect_uris: ["http://127.0.0.1:43210/callback"],
      token_endpoint_auth_method: "none",
    },
  });
  assert.equal(register.statusCode, 201, register.body);
  const clientId = register.json().client_id;
  const verifier = randomBytes(32).toString("base64url");
  const params = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:43210/callback",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "original-state",
    scope: "mcp:read mcp:write",
    resource,
  };
  const begin = await app.inject({
    url: `/mcp/oauth/authorize?${new URLSearchParams(params)}`,
  });
  assert.equal(begin.statusCode, 302, begin.body);
  const pending = new URL(begin.headers.location!).searchParams.get("request")!;
  const info = await app.inject({
    url: `/mcp/authorizations/${pending}`,
    headers,
  });
  assert.equal(info.statusCode, 200, info.body);
  assert.deepEqual(Object.keys(info.json().data).sort(), [
    "name",
    "redirectUri",
    "scopes",
  ]);
  const decision = await app.inject({
    method: "POST",
    url: `/mcp/authorizations/${pending}`,
    headers,
    payload: { approved: true, write },
  });
  assert.equal(decision.statusCode, 200, decision.body);
  const callback = new URL(decision.json().data.redirectUri);
  assert.equal(callback.searchParams.get("state"), params.state);
  const codeInput = {
    grant_type: "authorization_code",
    code: callback.searchParams.get("code")!,
    client_id: clientId,
    redirect_uri: params.redirect_uri,
    code_verifier: verifier,
    resource,
  };
  const exchange = await app.inject({
    method: "POST",
    url: "/mcp/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(codeInput).toString(),
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return {
    clientId,
    pending,
    codeInput,
    tokens: exchange.json() as {
      access_token: string;
      refresh_token: string;
      scope: string;
    },
  };
}

export async function sdk(fixture: Fixture, accessToken: string) {
  const client = new Client({ name: "integration-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    fetch: injectedFetch(fixture),
  });
  await client.connect(transport);
  return {
    client,
    async tool(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      return result.structuredContent as Record<string, unknown>;
    },
  };
}

export function injectedFetch(fixture: Fixture): typeof fetch {
  return async (url, init) => {
    const target = new URL(String(url));
    const response = await fixture.app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST" | "DELETE",
      url: target.pathname + target.search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      payload:
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : (init?.body as string | undefined),
    });
    return new Response(response.statusCode === 204 ? null : response.body, {
      status: response.statusCode,
      headers: Object.fromEntries(
        Object.entries(response.headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    });
  };
}

export async function grantWrites(
  fixture: Fixture,
  collection = fixture.names.posts,
) {
  const { app, db, access, names } = fixture;
  const assignment = await db("asmblyr_user_policies")
    .where({ user_id: access.principal.id })
    .first("policy_id");
  for (const action of ["create", "update"]) {
    const permission = await app.inject({
      method: "POST",
      url: "/permissions",
      payload: {
        collection,
        action,
        fields: collection === names.posts ? ["title", "author_id"] : ["title"],
        ...(action === "update"
          ? {
              rowFilter: {
                logic: "and",
                children: [
                  {
                    field: "title",
                    op: "neq",
                    value: { kind: "literal", value: "Beta" },
                  },
                ],
              },
            }
          : {}),
      },
    });
    assert.equal(permission.statusCode, 201, permission.body);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/policies/${assignment.policy_id}/permissions/${permission.json().data.id}`,
        })
      ).statusCode,
      204,
    );
  }
}
