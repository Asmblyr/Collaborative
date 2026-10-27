import type { Knex } from "knex";
import type { AuthenticatedUser } from "../auth/tokens.js";
import { securityEvent } from "../auth/security-events.js";
import { McpOAuthError } from "./oauth-input.js";

export async function listConnections(
  db: Knex,
  userId: string,
  resource: string,
) {
  const connections = await db("public.asmblyr_mcp_connections as connection")
    .join(
      "public.asmblyr_mcp_clients as client",
      "client.id",
      "connection.client_id",
    )
    .where("connection.user_id", userId)
    .whereNull("connection.revoked_at")
    .where("connection.expires_at", ">", db.fn.now())
    .join(
      "public.asmblyr_auth_sessions as session",
      "session.id",
      "connection.session_id",
    )
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .orderBy("connection.created_at", "desc")
    .select(
      "connection.id",
      "client.name",
      "connection.scopes",
      "connection.collection_ids",
      "connection.created_at",
      "connection.last_used_at",
      "connection.expires_at",
    );
  const ids = [
    ...new Set(connections.flatMap((row) => row.collection_ids as string[])),
  ];
  const collections = ids.length
    ? await db("public.asmblyr_collections")
        .whereIn("id", ids)
        .select("id", "name", "display_name")
    : [];
  return {
    url: resource,
    connections: connections.map((row) => ({
      id: row.id,
      name: row.name,
      scopes: row.scopes,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      collections: (row.collection_ids as string[]).map((id) => {
        const collection = collections.find((item) => item.id === id);
        return {
          id,
          label: collection?.display_name || collection?.name || "—",
        };
      }),
    })),
  };
}

export async function revokeConnection(
  db: Knex,
  actor: AuthenticatedUser,
  id: string,
) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) {
    throw new McpOAuthError("invalid_request");
  }
  await db.transaction(async (trx) => {
    const rows = await trx("public.asmblyr_mcp_connections")
      .where({ id, user_id: actor.id })
      .whereNull("revoked_at")
      .update({ revoked_at: trx.fn.now() })
      .returning("id");
    if (rows.length) {
      await securityEvent(trx, actor.id, "mcp.revoked", id);
    }
  });
}
