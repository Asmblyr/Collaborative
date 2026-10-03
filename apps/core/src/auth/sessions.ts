import type { Knex } from "knex";
import type { AuthenticatedUser } from "./tokens.js";
import { securityEvent } from "./security-events.js";

export function clientLabel(agent?: string): string {
  if (!agent) return "Unknown client";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "API client";
  const os = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iOS"
      : /Windows/.test(agent)
        ? "Windows"
        : /Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" · ");
}

export async function listSessions(db: Knex, user: AuthenticatedUser) {
  const rows = await db("asmblyr_auth_sessions")
    .where({ user_id: user.id, revoked_at: null })
    .where("expires_at", ">", db.fn.now())
    .orderBy("created_at", "desc")
    .select(
      "id",
      "client_label as clientLabel",
      "created_at as createdAt",
      "refreshed_at as refreshedAt",
      "expires_at as expiresAt",
    );
  return rows.map((row) => ({ ...row, current: row.id === user.sessionId }));
}

export async function revokeOwnedSessions(
  db: Knex,
  user: AuthenticatedUser,
  target: string | "others",
) {
  await db.transaction(async (trx) => {
    // UPDATE acquires the same row lock as refresh, so no revoked session can be revived.
    const query = trx("asmblyr_auth_sessions").where({ user_id: user.id });
    if (target === "others") query.whereNot("id", user.sessionId);
    else query.where("id", target);
    const rows = await query
      .whereNull("revoked_at")
      .update({ revoked_at: trx.fn.now() })
      .returning("id");
    if (!rows.length && target !== "others") {
      const owned = await trx("asmblyr_auth_sessions")
        .where({ user_id: user.id, id: target })
        .first("id");
      if (!owned)
        throw Object.assign(new Error("Session not found"), {
          statusCode: 404,
        });
    }
    if (rows.length)
      await securityEvent(trx, user.id, "user.sessions_revoked", user.id, {
        sessionIds: rows.map((row) => row.id),
      });
  });
}
