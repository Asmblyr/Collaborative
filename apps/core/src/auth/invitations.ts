import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Knex } from "knex";
import {
  requireDelegatedPolicies,
  requireManagedInvitation,
} from "../policies/delegation-access.js";
import { PolicyNotFoundError } from "../policies/validation.js";
import { securityEvent } from "./security-events.js";
import { listAllUsers, listUsersDirectory } from "./user-directory.js";
import {
  AuthConflictError,
  AuthInputError,
  InvalidCredentialsError,
  UserNotFoundError,
  normalizedEmail,
  parsePassword,
} from "./validation.js";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { listUsersDirectory };

export async function listUsers(database: Knex) {
  return listAllUsers(database);
}

export interface InviteUserOptions {
  actorId?: string;
  policyId?: string | null;
}

export interface BulkInviteCreatedItem {
  email: string;
  userId: string;
  invitationToken: string;
  expiresAt: string;
  policyId: string | null;
}

export interface BulkInviteSkippedItem {
  email: string;
  reason: "invalid_email" | "duplicate_in_batch" | "already_exists";
  message: string;
}

export interface BulkInviteResult {
  created: BulkInviteCreatedItem[];
  skipped: BulkInviteSkippedItem[];
  policyId: string | null;
}

async function authorizeStarterPolicy(
  transaction: Knex,
  policyId: string,
  actorId?: string,
): Promise<void> {
  if (actorId) {
    await requireDelegatedPolicies(transaction, actorId, "users", [policyId]);
  }
  const policy = await transaction("public.asmblyr_policies")
    .where({ id: policyId })
    .forShare()
    .first("id");
  if (!policy) {
    throw new PolicyNotFoundError();
  }
}

export async function inviteUser(
  database: Knex,
  emailInput: unknown,
  options: InviteUserOptions = {},
) {
  const email = normalizedEmail(emailInput);
  const policyId = options.policyId ?? null;
  const token = `asm_inv_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + invitationLifetimeMs);
  try {
    const user = await database.transaction(async (transaction) => {
      if (policyId) {
        await authorizeStarterPolicy(transaction, policyId, options.actorId);
      }
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
      if (policyId) {
        await transaction("public.asmblyr_user_policies")
          .insert({ policy_id: policyId, user_id: created.id })
          .onConflict()
          .ignore();
        if (options.actorId) {
          await securityEvent(
            transaction,
            options.actorId,
            "policy.user_assigned",
            policyId,
            { userId: created.id },
          );
        }
      }
      return created;
    });
    return {
      user,
      invitationToken: token,
      expiresAt: expiresAt.toISOString(),
      ...(policyId ? { policyId } : {}),
    };
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

export async function inviteUsersBulk(
  database: Knex,
  emailsInput: string[],
  options: InviteUserOptions = {},
): Promise<BulkInviteResult> {
  const policyId = options.policyId ?? null;
  if (policyId) {
    await database.transaction(async (transaction) => {
      await authorizeStarterPolicy(transaction, policyId, options.actorId);
    });
  }

  const created: BulkInviteCreatedItem[] = [];
  const skipped: BulkInviteSkippedItem[] = [];
  const seen = new Set<string>();

  for (const rawEntry of emailsInput) {
    const raw = rawEntry.trim();
    if (!raw) {
      continue;
    }
    let email: string;
    try {
      email = normalizedEmail(raw);
    } catch (error) {
      if (error instanceof AuthInputError) {
        skipped.push({
          email: raw,
          reason: "invalid_email",
          message: "Некорректный формат электронной почты.",
        });
        continue;
      }
      throw error;
    }
    if (seen.has(email)) {
      skipped.push({
        email,
        reason: "duplicate_in_batch",
        message: "Адрес повторяется в списке приглашений.",
      });
      continue;
    }
    seen.add(email);
    try {
      const invited = await inviteUser(database, email, {
        actorId: options.actorId,
        policyId,
      });
      created.push({
        email: invited.user.email,
        userId: invited.user.id,
        invitationToken: invited.invitationToken,
        expiresAt: invited.expiresAt,
        policyId,
      });
    } catch (error) {
      if (error instanceof AuthConflictError) {
        skipped.push({
          email,
          reason: "already_exists",
          message: "Пользователь с такой электронной почтой уже существует.",
        });
        continue;
      }
      throw error;
    }
  }

  return { created, skipped, policyId };
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
