import argon2 from "argon2";
import type { Knex } from "knex";
import { passwordOptions } from "./users.js";
import { requireRecentAuth } from "./recent-auth.js";
import type { AuthenticatedUser } from "./tokens.js";
import {
  AuthConflictError,
  AuthInputError,
  parsePassword,
} from "./validation.js";
import { securityEvent } from "./security-events.js";

export async function setInitialPassword(
  db: Knex,
  user: AuthenticatedUser,
  value: unknown,
): Promise<void> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("password" in value)
  ) {
    throw new AuthInputError("Password is required");
  }
  await requireRecentAuth(db, user);
  const passwordHash = await argon2.hash(
    parsePassword(value.password, 12),
    passwordOptions,
  );
  await db.transaction(async (trx) => {
    await trx("public.asmblyr_users")
      .where({ id: user.id })
      .forUpdate()
      .first("id");
    await requireRecentAuth(trx, user);
    if (
      await trx("public.asmblyr_password_credentials")
        .where({ user_id: user.id })
        .first("user_id")
    ) {
      throw new AuthConflictError(
        "Password already exists; use change password",
      );
    }
    await trx("public.asmblyr_password_credentials").insert({
      user_id: user.id,
      password_hash: passwordHash,
    });
    await securityEvent(trx, user.id, "user.password_added", user.id);
  });
}
