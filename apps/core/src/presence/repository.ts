import type { Knex } from "knex";
import type { AuthenticatedUser } from "../auth/tokens.js";
import { InvalidCredentialsError } from "../auth/validation.js";
import type { PresenceResult } from "@asmblyr/contracts";
import { ItemError } from "../items/validation.js";

export const presenceLeaseSeconds = 30;
export const presenceSessionLimit = 32;

export async function leavePresence(
  db: Knex,
  sessionId: string,
  clientId: string,
): Promise<void> {
  await db("public.asmblyr_presence")
    .where({ session_id: sessionId, client_id: clientId })
    .delete();
}
export async function touchPresence(
  db: Knex,
  user: AuthenticatedUser,
  clientId: string,
  scopeKey: string,
): Promise<PresenceResult> {
  await db.transaction(async (trx) => {
    // The same lock makes concurrent tab registrations respect the session bound.
    const session = await trx("public.asmblyr_auth_sessions")
      .where({ id: user.sessionId })
      .whereNull("revoked_at")
      .where("expires_at", ">", trx.fn.now())
      .forUpdate()
      .first("id");
    if (!session) {
      throw new InvalidCredentialsError();
    }
    await trx("public.asmblyr_presence")
      .where("expires_at", "<=", trx.fn.now())
      .delete();
    const address = { session_id: user.sessionId, client_id: clientId };
    const existing = await trx("public.asmblyr_presence")
      .where(address)
      .first("client_id");
    if (!existing) {
      const count = await trx("public.asmblyr_presence")
        .where({ session_id: user.sessionId })
        .count<{ count: string }[]>("*")
        .first();
      if (Number(count?.count) >= presenceSessionLimit) {
        throw new ItemError("Too many open views", 429);
      }
    }
    await trx("public.asmblyr_presence")
      .insert({
        ...address,
        scope_key: scopeKey,
        expires_at: trx.raw("CURRENT_TIMESTAMP + ? * INTERVAL '1 second'", [
          presenceLeaseSeconds,
        ]),
      })
      .onConflict(["session_id", "client_id"])
      .merge(["scope_key", "expires_at"]);
  });
  const active = db("asmblyr_presence as presence")
    .withSchema("public")
    .join(
      "asmblyr_auth_sessions as session",
      "session.id",
      "presence.session_id",
    )
    .join("asmblyr_users as usr", "usr.id", "session.user_id")
    .where("presence.scope_key", scopeKey)
    .where("presence.expires_at", ">", db.fn.now())
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .where("usr.status", "active");
  const count = await active
    .clone()
    .countDistinct<{ total: string }[]>("usr.id as total")
    .first();
  const rows = await active
    .clone()
    .select("usr.id", "usr.display_name", "usr.picture_url")
    .count<
      {
        id: string;
        display_name: string | null;
        picture_url: string | null;
        views: string;
      }[]
    >("* as views")
    .groupBy("usr.id", "usr.display_name", "usr.picture_url")
    .orderByRaw("(usr.id = ?) DESC", [user.id])
    .orderBy("usr.id")
    .limit(50);
  return {
    data: {
      total: Number(count?.total ?? 0),
      participants: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name || "Участник",
        pictureUrl: row.picture_url,
        views: Number(row.views),
        self: row.id === user.id,
      })),
    },
  };
}
