import type { Knex } from "knex";
import { issueUserTokens, type TokenPair } from "../tokens.js";
import { securityEvent } from "../security-events.js";
import type { SsoProvider } from "./config.js";
import { SsoError } from "./input.js";
import type { ExternalIdentity } from "./protocol.js";

interface IdentityRow extends ExternalIdentity {
  id: string;
  user_id: string;
  created_at: Date;
}

async function lockActiveUser(
  trx: Knex.Transaction,
  userId: string,
): Promise<void> {
  const user = await trx("public.asmblyr_users")
    .where({ id: userId })
    .forUpdate()
    .first<{ status: string }>("status");
  if (user?.status !== "active")
    throw new SsoError("SSO_AUTH_FAILED", "Account is unavailable");
}

export async function linkIdentity(
  db: Knex,
  userId: string,
  sessionId: string,
  identity: ExternalIdentity,
): Promise<void> {
  try {
    await db.transaction(async (trx) => {
      await lockActiveUser(trx, userId);
      const session = await trx("public.asmblyr_auth_sessions")
        .where({ id: sessionId, user_id: userId })
        .whereNull("revoked_at")
        .where("expires_at", ">", trx.fn.now())
        .forUpdate()
        .first("id");
      if (!session)
        throw new SsoError(
          "SSO_INVALID_FLOW",
          "The linking session is no longer active",
        );
      const existing = await trx("public.asmblyr_user_identities")
        .where(identity)
        .first<IdentityRow>();
      if (existing?.user_id === userId) return;
      if (existing)
        throw new SsoError(
          "SSO_IDENTITY_CONFLICT",
          "This provider account is already linked",
        );
      await trx("public.asmblyr_user_identities").insert({
        user_id: userId,
        ...identity,
      });
      await securityEvent(trx, userId, "user.identity_linked", userId, {
        provider: identity.provider,
      });
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new SsoError(
        "SSO_IDENTITY_CONFLICT",
        "A provider account is already linked",
      );
    }
    throw error;
  }
}

export async function loginWithIdentity(
  db: Knex,
  identity: ExternalIdentity,
  userAgent?: string,
): Promise<TokenPair> {
  const record = await db("public.asmblyr_user_identities")
    .where(identity)
    .first<IdentityRow>();
  if (!record) {
    throw new SsoError(
      "SSO_NOT_LINKED",
      "Sign in to your existing account and link this provider in your profile",
    );
  }
  return db.transaction(async (trx) => {
    await lockActiveUser(trx, record.user_id);
    if (
      !(await trx("public.asmblyr_user_identities")
        .where({ id: record.id })
        .first("id"))
    ) {
      throw new SsoError(
        "SSO_NOT_LINKED",
        "This provider account was unlinked",
      );
    }
    const tokens = await issueUserTokens(trx, record.user_id, userAgent);
    await securityEvent(trx, record.user_id, "user.sso_login", record.user_id, {
      provider: identity.provider,
    });
    return tokens;
  });
}

export async function listIdentities(
  db: Knex,
  userId: string,
  providers: SsoProvider[],
) {
  const rows = await db("public.asmblyr_user_identities")
    .where({ user_id: userId })
    .select<IdentityRow[]>("id", "provider", "issuer", "created_at");
  return rows.map((row) => {
    const provider = providers.find(
      (entry) => entry.id === row.provider && entry.issuer === row.issuer,
    );
    return {
      id: row.id,
      provider: row.provider,
      label: provider?.label ?? row.provider,
      available: Boolean(provider),
      createdAt: row.created_at,
    };
  });
}

export async function unlinkIdentity(
  db: Knex,
  userId: string,
  identityId: string,
  providers: SsoProvider[],
): Promise<void> {
  await db.transaction(async (trx) => {
    await lockActiveUser(trx, userId);
    const row = await trx("public.asmblyr_user_identities")
      .where({ id: identityId, user_id: userId })
      .first<IdentityRow>();
    if (!row) throw new SsoError("SSO_NOT_LINKED", "Identity not found");
    const password = await trx("public.asmblyr_password_credentials")
      .where({ user_id: userId })
      .first("user_id");
    const others = await trx("public.asmblyr_user_identities")
      .where({ user_id: userId })
      .whereNot({ id: identityId })
      .select<IdentityRow[]>("provider", "issuer");
    const otherAvailable = others.some((other) =>
      providers.some(
        (provider) =>
          provider.id === other.provider && provider.issuer === other.issuer,
      ),
    );
    const passkey = await trx("public.asmblyr_passkeys")
      .where({ user_id: userId })
      .first("id");
    if (!password && !otherAvailable && !passkey) {
      throw new SsoError(
        "SSO_LAST_IDENTITY",
        "Cannot remove the last available sign-in method",
      );
    }
    await trx("public.asmblyr_user_identities")
      .where({ id: identityId })
      .delete();
    await securityEvent(trx, userId, "user.identity_unlinked", userId, {
      provider: row.provider,
    });
  });
}
