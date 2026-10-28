import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { AuthenticatedUser } from "../auth/tokens.js";
import { securityEvent } from "../auth/security-events.js";
import { objectInput } from "../shared/input.js";
import { sessionPrincipal } from "./access.js";
import {
  authorization,
  registration,
  digest,
  secret,
  McpOAuthError,
} from "./oauth-input.js";

export async function registerClient(db: Knex, body: unknown) {
  const input = registration(body);
  const id = randomUUID();
  await db("public.asmblyr_mcp_clients").insert({
    id,
    name: input.name,
    redirect_uris: JSON.stringify(input.redirects),
  });
  return {
    client_id: id,
    client_name: input.name,
    redirect_uris: input.redirects,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "mcp:read mcp:write",
  };
}

export async function beginAuthorization(
  db: Knex,
  query: unknown,
  resource: string,
): Promise<string> {
  const input = authorization(query, resource);
  const client = await db("public.asmblyr_mcp_clients")
    .where({ id: input.clientId })
    .first();
  if (!client || !client.redirect_uris.includes(input.redirect)) {
    throw new McpOAuthError("invalid_client");
  }
  const request = secret();
  await db("public.asmblyr_mcp_authorizations").insert({
    request_hash: digest(request),
    client_id: client.id,
    redirect_uri: input.redirect,
    state: input.state,
    challenge: input.challenge,
    scopes: JSON.stringify(input.scopes),
    resource,
    expires_at: new Date(Date.now() + 600000),
  });
  return request;
}

async function pending(db: Knex, request: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(request)) {
    throw new McpOAuthError("invalid_request");
  }
  const row = await db("public.asmblyr_mcp_authorizations")
    .where({ request_hash: digest(request) })
    .whereNull("decided_at")
    .where("expires_at", ">", db.fn.now())
    .first();
  if (!row) {
    throw new McpOAuthError("invalid_request");
  }
  return row;
}

export async function authorizationInfo(db: Knex, request: string) {
  const row = await pending(db, request);
  const client = await db("public.asmblyr_mcp_clients")
    .where({ id: row.client_id })
    .first();
  return {
    name: client.name,
    redirectUri: row.redirect_uri,
    scopes: row.scopes as string[],
  };
}

export async function decideAuthorization(
  db: Knex,
  request: string,
  actor: AuthenticatedUser,
  value: unknown,
) {
  const input = objectInput(value, ["approved", "write"]);
  if (typeof input.approved !== "boolean" || typeof input.write !== "boolean") {
    throw new McpOAuthError("invalid_request");
  }
  return db.transaction(async (trx) => {
    const initial = await pending(trx, request);
    const row = await trx("public.asmblyr_mcp_authorizations")
      .where({ request_hash: initial.request_hash })
      .forUpdate()
      .first();
    if (row.decided_at || row.expires_at <= new Date()) {
      throw new McpOAuthError("invalid_request");
    }
    const principal = await sessionPrincipal(trx, actor.sessionId);
    if (!principal || principal.id !== actor.id) {
      throw new McpOAuthError("access_denied", 403);
    }
    const callback = new URL(row.redirect_uri);
    if (row.state) {
      callback.searchParams.set("state", row.state);
    }
    if (!input.approved) {
      await trx("public.asmblyr_mcp_authorizations")
        .where({ request_hash: row.request_hash })
        .update({ decided_at: trx.fn.now() });
      callback.searchParams.set("error", "access_denied");
      return { redirectUri: callback.href };
    }
    if (input.write && !row.scopes.includes("mcp:write")) {
      throw new McpOAuthError("access_denied", 403);
    }
    const id = randomUUID();
    const session = await trx("public.asmblyr_auth_sessions")
      .where({ id: actor.sessionId })
      .first("expires_at");
    await trx("public.asmblyr_mcp_connections").insert({
      id,
      client_id: row.client_id,
      user_id: actor.id,
      session_id: actor.sessionId,
      scopes: JSON.stringify(
        input.write ? ["mcp:read", "mcp:write"] : ["mcp:read"],
      ),
      resource: row.resource,
      expires_at: new Date(
        Math.min(
          Date.now() + 30 * 86400000,
          new Date(session.expires_at).getTime(),
        ),
      ),
    });
    const code = secret();
    await trx("public.asmblyr_mcp_authorizations")
      .where({ request_hash: row.request_hash })
      .update({
        code_hash: digest(code),
        connection_id: id,
        decided_at: trx.fn.now(),
        expires_at: new Date(Date.now() + 60000),
      });
    await securityEvent(trx, actor.id, "mcp.connected", id, {
      write: input.write,
      access: "account",
    });
    callback.searchParams.set("code", code);
    return { redirectUri: callback.href };
  });
}
