import argon2 from "argon2";
import type { Knex } from "knex";
import { issueUserTokens } from "./tokens.js";
import {
  AuthConflictError,
  InvalidCredentialsError,
  normalizedEmail,
  parsePassword,
} from "./validation.js";

export const passwordOptions = {
  type: argon2.argon2id as 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function bootstrapSuperuser(
  database: Knex,
  emailInput: unknown,
  passwordInput: unknown,
): Promise<{ id: string; email: string }> {
  const email = normalizedEmail(emailInput);
  const password = parsePassword(passwordInput, 12);
  const passwordHash = await argon2.hash(password, passwordOptions);
  return database.transaction(async (transaction) => {
    await transaction.raw("SELECT pg_advisory_xact_lock(691241, 1)");
    const [{ count }] = await transaction("asmblyr_users")
      .withSchema("public")
      .count<{ count: string }[]>("* as count");
    if (Number(count) > 0)
      throw new AuthConflictError("Initial setup is already complete");
    const [user] = await transaction("asmblyr_users")
      .withSchema("public")
      .insert({ email, superuser: true })
      .returning<{ id: string; email: string }[]>(["id", "email"]);
    await transaction("asmblyr_password_credentials")
      .withSchema("public")
      .insert({ user_id: user.id, password_hash: passwordHash });
    return user;
  });
}

export async function loginWithPassword(
  database: Knex,
  emailInput: unknown,
  passwordInput: unknown,
  userAgent?: string,
) {
  const email = normalizedEmail(emailInput);
  const password = parsePassword(passwordInput);
  const user = await database("asmblyr_users as usr")
    .withSchema("public")
    .join(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    )
    .where("usr.email", email)
    .first<{
      id: string;
      status: "active" | "disabled";
      password_hash: string;
    }>("usr.id", "usr.status", "credential.password_hash");
  if (
    !user ||
    !(await argon2.verify(user.password_hash, password)) ||
    user.status !== "active"
  ) {
    throw new InvalidCredentialsError();
  }
  // Recheck under the same lock used by password changes: an old verified
  // password must never issue a session after that password was replaced.
  return database.transaction(async (trx) => {
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
    if (credential?.password_hash !== user.password_hash)
      throw new InvalidCredentialsError();
    return issueUserTokens(trx, user.id, userAgent);
  });
}
