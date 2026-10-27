import type { Knex } from "knex";
import { objectInput } from "../shared/input.js";
import { activeConnection } from "./access.js";
import {
  digest,
  secret,
  text,
  clientId as parseClientId,
  McpOAuthError,
} from "./oauth-input.js";

async function validConnection(db: Knex, id: string, resource: string) {
  try {
    return await activeConnection(db, id, resource);
  } catch (error) {
    if (error instanceof McpOAuthError) {
      throw new McpOAuthError("invalid_grant");
    }
    throw error;
  }
}

async function issue(
  db: Knex,
  connection: { id: string; scopes: string[]; expires_at: Date },
) {
  const access = `asm_mcp_at_${secret()}`;
  const refresh = `asm_mcp_rt_${secret()}`;
  const seconds = Math.max(
    0,
    Math.min(
      300,
      Math.floor(
        (new Date(connection.expires_at).getTime() - Date.now()) / 1000,
      ),
    ),
  );
  if (!seconds) {
    throw new McpOAuthError("invalid_grant");
  }
  await db("public.asmblyr_mcp_tokens").insert({
    access_hash: digest(access),
    refresh_hash: digest(refresh),
    connection_id: connection.id,
    expires_at: new Date(Date.now() + seconds * 1000),
  });
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: seconds,
    scope: connection.scopes.join(" "),
  };
}

export async function exchangeToken(
  db: Knex,
  value: unknown,
  resource: string,
) {
  const input = objectInput(value, [
    "grant_type",
    "client_id",
    "code",
    "redirect_uri",
    "code_verifier",
    "refresh_token",
    "resource",
    "scope",
  ]);
  if (input.resource !== resource) {
    throw new McpOAuthError("invalid_target");
  }
  const clientId = parseClientId(input.client_id);
  const result = await db.transaction(async (trx) => {
    if (input.grant_type === "authorization_code") {
      const code = text(input.code, 128);
      const verifier = text(input.code_verifier, 128);
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
        throw new McpOAuthError("invalid_grant");
      }
      const row = await trx("public.asmblyr_mcp_authorizations")
        .where({ code_hash: digest(code) })
        .forUpdate()
        .first();
      const challenge = Buffer.from(digest(verifier), "hex").toString(
        "base64url",
      );
      if (
        !row ||
        row.client_id !== clientId ||
        row.redirect_uri !== input.redirect_uri ||
        row.resource !== resource ||
        row.challenge !== challenge ||
        !row.connection_id
      ) {
        throw new McpOAuthError("invalid_grant");
      }
      if (row.consumed_at) {
        await trx("public.asmblyr_mcp_connections")
          .where({ id: row.connection_id })
          .update({ revoked_at: trx.fn.now() });
        return null;
      }
      if (row.expires_at <= new Date()) {
        throw new McpOAuthError("invalid_grant");
      }
      const { row: connection } = await validConnection(
        trx,
        row.connection_id,
        resource,
      );
      await trx("public.asmblyr_mcp_authorizations")
        .where({ request_hash: row.request_hash })
        .update({ consumed_at: trx.fn.now() });
      return issue(trx, connection);
    }
    if (input.grant_type === "refresh_token") {
      const refresh = text(input.refresh_token, 128);
      if (!/^asm_mcp_rt_[A-Za-z0-9_-]{43}$/.test(refresh)) {
        throw new McpOAuthError("invalid_grant");
      }
      const token = await trx("public.asmblyr_mcp_tokens")
        .where({ refresh_hash: digest(refresh) })
        .forUpdate()
        .first();
      if (!token) {
        throw new McpOAuthError("invalid_grant");
      }
      const { row: connection } = await validConnection(
        trx,
        token.connection_id,
        resource,
      );
      if (
        connection.client_id !== clientId ||
        (input.scope && input.scope !== connection.scopes.join(" "))
      ) {
        throw new McpOAuthError("invalid_grant");
      }
      if (token.consumed_at) {
        await trx("public.asmblyr_mcp_connections")
          .where({ id: connection.id })
          .update({ revoked_at: trx.fn.now() });
        return null;
      }
      await trx("public.asmblyr_mcp_tokens")
        .where({ access_hash: token.access_hash })
        .update({ consumed_at: trx.fn.now() });
      return issue(trx, connection);
    }
    throw new McpOAuthError("unsupported_grant_type");
  });
  // Reuse revocation must commit before returning the protocol error.
  if (!result) {
    throw new McpOAuthError("invalid_grant");
  }
  return result;
}

export async function revokeToken(db: Knex, value: unknown) {
  const input = objectInput(value, ["token", "client_id", "token_type_hint"]);
  const hash = digest(text(input.token, 128));
  const row = await db("public.asmblyr_mcp_tokens as token")
    .join(
      "public.asmblyr_mcp_connections as connection",
      "connection.id",
      "token.connection_id",
    )
    .where("connection.client_id", parseClientId(input.client_id))
    .where((builder) =>
      builder
        .where("token.access_hash", hash)
        .orWhere("token.refresh_hash", hash),
    )
    .first("connection.id");
  if (row) {
    await db("public.asmblyr_mcp_connections")
      .where({ id: row.id })
      .update({ revoked_at: db.fn.now() });
  }
}
