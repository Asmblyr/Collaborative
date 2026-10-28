import type { Knex } from "knex";
import { loadPrincipalAccess, type Access } from "../permissions/access.js";
import type { Principal } from "../auth/principal.js";
import { digest, McpOAuthError } from "./oauth-input.js";

export async function sessionPrincipal(
  db: Knex,
  sessionId: string,
): Promise<Extract<Principal, { kind: "user" }> | undefined> {
  const row = await db("public.asmblyr_auth_sessions as session")
    .join("public.asmblyr_users as usr", "usr.id", "session.user_id")
    .where("session.id", sessionId)
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .where("usr.status", "active")
    .first("usr.id", "usr.email", "usr.superuser");
  return row ? { ...row, kind: "user", sessionId } : undefined;
}

export async function activeConnection(db: Knex, id: string, resource: string) {
  const row = await db("public.asmblyr_mcp_connections")
    .where({ id, resource })
    .whereNull("revoked_at")
    .where("expires_at", ">", db.fn.now())
    .first();
  const principal = row
    ? await sessionPrincipal(db, row.session_id)
    : undefined;
  if (!row || !principal || principal.id !== row.user_id) {
    throw new McpOAuthError("invalid_token", 401);
  }
  return { row, principal };
}

export async function authenticateMcp(
  db: Knex,
  header: string | undefined,
  resource: string,
) {
  const match = /^Bearer (asm_mcp_at_[A-Za-z0-9_-]{43})$/i.exec(header ?? "");
  if (!match) {
    throw new McpOAuthError("invalid_token", 401);
  }
  const token = await db("public.asmblyr_mcp_tokens")
    .where({ access_hash: digest(match[1]) })
    .whereNull("consumed_at")
    .where("expires_at", ">", db.fn.now())
    .first();
  if (!token) {
    throw new McpOAuthError("invalid_token", 401);
  }
  const result = await activeConnection(db, token.connection_id, resource);
  await db("public.asmblyr_mcp_connections")
    .where({ id: result.row.id })
    .update({ last_used_at: db.fn.now() });
  return result;
}

/** Reload account rights on every call; OAuth only restricts the general mode. */
export async function connectionAccess(
  db: Knex,
  id: string,
  resource: string,
): Promise<Access> {
  const { row, principal } = await activeConnection(db, id, resource);
  const access = await loadPrincipalAccess(db, principal);
  return { ...access, readOnly: !row.scopes.includes("mcp:write") };
}
