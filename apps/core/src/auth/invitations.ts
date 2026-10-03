import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Knex } from "knex";
import { requireManagedInvitation } from "../policies/delegation-access.js";
import {
  AuthConflictError,
  InvalidCredentialsError,
  UserNotFoundError,
  normalizedEmail,
  parsePassword,
} from "./validation.js";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listUsers(database: Knex) {
  const users = await database("asmblyr_users as usr")
    .withSchema("public")
    .leftJoin(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    )
    .select<
      {
        id: string;
        email: string;
        status: string;
        superuser: boolean;
        created_at: Date;
        hasPassword: boolean;
        hasDelegation: boolean;
      }[]
    >(
      "usr.id",
      "usr.email",
      "usr.status",
      "usr.superuser",
      "usr.created_at",
      database.raw("credential.user_id IS NOT NULL AS ??", ["hasPassword"]),
      database.raw(
        "EXISTS (SELECT 1 FROM public.asmblyr_user_invitations WHERE user_id = usr.id AND consumed_at IS NULL) AS ??",
        ["invitationPending"],
      ),
      database.raw(
        "EXISTS (SELECT 1 FROM public.asmblyr_user_policy_delegations WHERE user_id = usr.id) AS ??",
        ["hasDelegation"],
      ),
    )
    .orderBy("usr.email");
  const assignments = await database("asmblyr_user_policies")
    .withSchema("public")
    .select<{ user_id: string; policy_id: string }[]>("user_id", "policy_id");
  return users.map((user) => ({
    ...user,
    policyIds: assignments
      .filter((assignment) => assignment.user_id === user.id)
      .map((assignment) => assignment.policy_id),
  }));
}

export async function inviteUser(database: Knex, emailInput: unknown) {
  const email = normalizedEmail(emailInput);
  const token = `asm_inv_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + invitationLifetimeMs);
  try {
    const user = await database.transaction(async (transaction) => {
      const [created] = await transaction("asmblyr_users")
        .withSchema("public")
        .insert({ email, superuser: false })
        .returning<
          { id: string; email: string; status: string; superuser: boolean }[]
        >(["id", "email", "status", "superuser"]);
      await transaction("asmblyr_user_invitations")
        .withSchema("public")
        .insert({
          user_id: created.id,
          token_hash: hashToken(token),
          expires_at: expiresAt,
        });
      return created;
    });
    return { user, invitationToken: token, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AuthConflictError("Email already exists");
    }
    throw error;
  }
}

export async function renewInvitation(
  database: Knex,
  userId: string,
  actorId: string,
) {
  const token = `asm_inv_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + invitationLifetimeMs);
  const user = await database.transaction(async (transaction) => {
    const lockedTarget = await transaction("asmblyr_users")
      .withSchema("public")
      .where({ id: userId })
      .forUpdate()
      .first("id");
    if (!lockedTarget) {
      throw new UserNotFoundError();
    }
    await requireManagedInvitation(transaction, actorId, userId);
    const invitation = await transaction("asmblyr_user_invitations")
      .withSchema("public")
      .where({ user_id: userId })
      .forUpdate()
      .first("user_id", "consumed_at");
    if (!invitation) {
      throw new UserNotFoundError();
    }
    const target = await transaction("asmblyr_users")
      .withSchema("public")
      .where({ id: userId })
      .first<{
        id: string;
        email: string;
        status: string;
        superuser: boolean;
      }>("id", "email", "status", "superuser");
    if (!target) {
      throw new UserNotFoundError();
    }
    const credential = await transaction("asmblyr_password_credentials")
      .withSchema("public")
      .where({ user_id: userId })
      .first("user_id");
    const passkey = await transaction("public.asmblyr_passkeys")
      .where({ user_id: userId })
      .first("id");
    const identity = await transaction("public.asmblyr_user_identities")
      .where({ user_id: userId })
      .first("id");
    if (
      target.superuser ||
      target.status !== "active" ||
      credential ||
      invitation.consumed_at ||
      passkey ||
      identity
    ) {
      throw new AuthConflictError("Invitation cannot be renewed for this user");
    }
    await transaction("asmblyr_user_invitations")
      .withSchema("public")
      .where({ user_id: userId })
      .update({
        token_hash: hashToken(token),
        expires_at: expiresAt,
        consumed_at: null,
        created_at: new Date(),
      });
    return target;
  });
  return { user, invitationToken: token, expiresAt: expiresAt.toISOString() };
}

export async function acceptInvitation(
  database: Knex,
  token: string,
  passwordInput: unknown,
) {
  const password = parsePassword(passwordInput, 12);
  const link = await database("public.asmblyr_user_invitations")
    .where({ token_hash: hashToken(token) })
    .first<{ user_id: string }>("user_id");
  if (!link) throw new InvalidCredentialsError();
  return database.transaction(async (transaction) => {
    const user = await transaction("public.asmblyr_users")
      .where({ id: link.user_id, status: "active", superuser: false })
      .forUpdate()
      .first<{ id: string; email: string }>("id", "email");
    const invitation = await transaction("asmblyr_user_invitations")
      .withSchema("public")
      .where({ token_hash: hashToken(token) })
      .forUpdate()
      .first<{ user_id: string; expires_at: Date; consumed_at: Date | null }>();
    if (
      !invitation ||
      invitation.consumed_at ||
      invitation.expires_at <= new Date()
    ) {
      throw new InvalidCredentialsError();
    }
    if (!user) throw new InvalidCredentialsError();
    for (const table of [
      "asmblyr_password_credentials",
      "asmblyr_passkeys",
      "asmblyr_user_identities",
    ]) {
      if (
        await transaction(`public.${table}`).where({ user_id: user.id }).first()
      ) {
        throw new InvalidCredentialsError();
      }
    }
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await transaction("asmblyr_password_credentials")
      .withSchema("public")
      .insert({ user_id: user.id, password_hash: passwordHash });
    await transaction("asmblyr_user_invitations")
      .withSchema("public")
      .where({ user_id: user.id })
      .update({ consumed_at: new Date() });
    return user;
  });
}
