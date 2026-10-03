import type { Knex } from "knex";
import type { AuthenticatedUser } from "./tokens.js";

/** Refreshing a token does not extend the time since interactive authentication. */
export async function requireRecentAuth(
  db: Knex,
  user: AuthenticatedUser,
): Promise<void> {
  const session = await db("public.asmblyr_auth_sessions as session")
    .join("public.asmblyr_users as usr", "usr.id", "session.user_id")
    .where({
      "session.id": user.sessionId,
      "session.user_id": user.id,
      "usr.status": "active",
    })
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .where("session.created_at", ">", new Date(Date.now() - 5 * 60 * 1000))
    .first("session.id");
  if (!session) {
    throw Object.assign(
      new Error("Войдите повторно, чтобы изменить способы входа"),
      {
        statusCode: 403,
        code: "RECENT_AUTH_REQUIRED",
      },
    );
  }
}
