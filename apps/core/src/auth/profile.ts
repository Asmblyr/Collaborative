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

export async function getProfile(
  db: Knex,
  user: AuthenticatedUser,
): Promise<CurrentUser> {
  const row = await db("asmblyr_users")
    .withSchema("public")
    .where({ id: user.id })
    .first<{
      display_name: string | null;
      created_at: Date;
      picture_url: string | null;
    }>("display_name", "created_at", "picture_url");
  if (!row) throw new InvalidCredentialsError();
  const password = await db("asmblyr_password_credentials")
    .withSchema("public")
    .where({ user_id: user.id })
    .first("user_id");
  return {
    id: user.id,
    email: user.email,
    superuser: user.superuser,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    createdAt: row.created_at.toISOString(),
    hasPassword: Boolean(password),
  };
}

export async function updateProfile(
  db: Knex,
  user: AuthenticatedUser,
  value: unknown,
) {
  const changes = parseProfile(value);
  await db("asmblyr_users")
    .withSchema("public")
    .where({ id: user.id })
    .update(changes);
  return getProfile(db, user);
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
