import { createHash, randomBytes } from "node:crypto";
import type { Knex } from "knex";
import { issueUserTokens, type AuthenticatedUser } from "./tokens.js";
import {
  AuthConflictError,
  AuthInputError,
  InvalidCredentialsError,
} from "./validation.js";
import { requireRecentAuth } from "./recent-auth.js";
import { securityEvent } from "./security-events.js";
import { clearRecoveredAccess } from "./recover-access.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function parseLoginLink(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    !/^asm_(inv|rec)_[A-Za-z0-9_-]{43}$/.test(value.token)
  ) {
    throw new AuthInputError("Login link is required");
  }
  return value.token;
}

export async function createRecoveryLink(
  db: Knex,
  actor: AuthenticatedUser,
  userId: string,
) {
  const token = `asm_rec_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.transaction(async (trx) => {
    // Recovery is deliberately not delegated with ordinary user-management permissions.
    const administrator = await trx("public.asmblyr_users")
      .where({ id: actor.id, status: "active", superuser: true })
      .forShare()
      .first("id");
    await requireRecentAuth(trx, actor);
    const target = await trx("public.asmblyr_users")
      .where({ id: userId, status: "active" })
      .forUpdate()
      .first<{ superuser: boolean }>("superuser");
    if (!administrator || !target || target.superuser || actor.id === userId) {
      throw new AuthConflictError(
        "Recovery is restricted to ordinary active users",
      );
    }
    await trx("public.asmblyr_recovery_links")
      .insert({
        user_id: userId,
        token_hash: hash(token),
        expires_at: expiresAt,
      })
      .onConflict("user_id")
      .merge({
        token_hash: hash(token),
        expires_at: expiresAt,
        consumed_at: null,
      });
    await securityEvent(trx, actor.id, "user.recovery_issued", userId);
  });
  return { invitationToken: token, expiresAt: expiresAt.toISOString() };
}

export async function claimLoginLink(
  db: Knex,
  token: string,
  userAgent?: string,
) {
  const recovery = token.startsWith("asm_rec_");
  const table = recovery
    ? "public.asmblyr_recovery_links"
    : "public.asmblyr_user_invitations";
  // All credential-management operations lock the user before credential/link rows.
  const link = await db(table)
    .where({ token_hash: hash(token) })
    .first<{ user_id: string }>("user_id");
  if (!link) {
    throw new InvalidCredentialsError();
  }
  return db.transaction(async (trx) => {
    const user = await trx("public.asmblyr_users")
      .where({ id: link.user_id, status: "active" })
      .forUpdate()
      .first<{ id: string; superuser: boolean }>("id", "superuser");
    const current = await trx(table)
      .where({ user_id: link.user_id, token_hash: hash(token) })
      .whereNull("consumed_at")
      .where("expires_at", ">", trx.fn.now())
      .forUpdate()
      .first("user_id");
    if (!user || !current || (recovery && user.superuser)) {
      throw new InvalidCredentialsError();
    }
    if (recovery) {
      await clearRecoveredAccess(trx, user.id);
    } else {
      const password = await trx("public.asmblyr_password_credentials")
        .where({ user_id: user.id })
        .first("user_id");
      const passkey = await trx("public.asmblyr_passkeys")
        .where({ user_id: user.id })
        .first("id");
      const identity = await trx("public.asmblyr_user_identities")
        .where({ user_id: user.id })
        .first("id");
      if (password || passkey || identity || user.superuser) {
        throw new InvalidCredentialsError();
      }
    }
    await trx(table)
      .where({ user_id: user.id })
      .update({ consumed_at: trx.fn.now() });
    await securityEvent(
      trx,
      user.id,
      recovery ? "user.recovery_claimed" : "user.invitation_claimed",
      user.id,
    );
    return issueUserTokens(trx, user.id, userAgent);
  });
}
