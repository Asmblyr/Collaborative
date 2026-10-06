import argon2 from "argon2";
import type { Knex } from "knex";
import type { AuthenticatedUser } from "./tokens.js";
import { passwordOptions } from "./users.js";
import {
  AuthInputError,
  InvalidCredentialsError,
  parsePassword,
} from "./validation.js";
import { parseProfile } from "./profile-input.js";
import { securityEvent } from "./security-events.js";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { readUserProfile } from "./profile-repository.js";
import { files } from "../files/repository.js";
import { loadPrincipalAccess } from "../permissions/access.js";
import { requireFileRead } from "../files/references.js";

export async function getProfile(
  db: Knex,
  user: AuthenticatedUser,
): Promise<CurrentUser> {
  return readUserProfile(db, user.id);
}

export async function updateProfile(
  db: Knex,
  user: AuthenticatedUser,
  value: unknown,
  targetId = user.id,
) {
  const changes = parseProfile(value);
  return db.transaction(async (trx) => {
    await readUserProfile(trx, targetId);
    if (changes.avatar_id) {
      const access = await loadPrincipalAccess(trx, { ...user, kind: "user" });
      const avatar = await files(trx)
        .where({ id: changes.avatar_id })
        .forShare()
        .first("status", "preview_type", "uploaded_by");
      if (avatar?.uploaded_by !== user.id) {
        await requireFileRead(trx, changes.avatar_id, access);
      }
      if (avatar?.status !== "ready" || !avatar.preview_type) {
        throw new AuthInputError("Select a ready raster image for the avatar");
      }
    }
    await trx("public.asmblyr_users")
      .where({ id: targetId })
      .update({ ...changes, updated_at: trx.fn.now() });
    return readUserProfile(trx, targetId);
  });
}

export async function changePassword(
  db: Knex,
  user: AuthenticatedUser,
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("currentPassword" in value) ||
    !("newPassword" in value)
  )
    throw new AuthInputError("Passwords are required");
  const current = parsePassword(value.currentPassword);
  const next = parsePassword(value.newPassword, 12);
  if (current === next) throw new AuthInputError("Choose a different password");
  // Expensive new-password hashing happens before taking the credential lock.
  const hash = await argon2.hash(next, passwordOptions);
  await db.transaction(async (trx) => {
    const active = await trx("public.asmblyr_users")
      .where({ id: user.id, status: "active" })
      .forUpdate()
      .first("id");
    if (!active) throw new InvalidCredentialsError();
    const credential = await trx("asmblyr_password_credentials")
      .withSchema("public")
      .where({ user_id: user.id })
      .forUpdate()
      .first<{ password_hash: string }>("password_hash");
    if (
      !credential ||
      !(await argon2.verify(credential.password_hash, current))
    )
      throw new InvalidCredentialsError();
    await trx("asmblyr_password_credentials")
      .withSchema("public")
      .where({ user_id: user.id })
      .update({ password_hash: hash, updated_at: trx.fn.now() });
    await trx("asmblyr_auth_sessions")
      .withSchema("public")
      .where({ user_id: user.id, revoked_at: null })
      .update({ revoked_at: trx.fn.now() });
    await securityEvent(trx, user.id, "user.password_changed", user.id);
  });
}
