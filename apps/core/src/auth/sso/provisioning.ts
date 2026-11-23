import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { issueUserTokens, type TokenPair } from "../tokens.js";
import { securityEvent } from "../security-events.js";
import type { SsoProvider } from "./config.js";
import { SsoError } from "./input.js";
import { eligibleEmailForSso, type ExternalProfile } from "./profile.js";
import type { ExternalIdentity } from "./protocol.js";

interface UserLookupRow {
  id: string;
  status: string;
  superuser: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

export function notLinkedError(): SsoError {
  return new SsoError(
    "SSO_NOT_LINKED",
    "Sign in to your existing account and link this provider in your profile",
  );
}

function advisoryLockKey(email: string): string {
  const digest = createHash("sha256").update(`asmblyr:sso:${email}`).digest();
  return digest.readBigInt64BE(0).toString();
}

async function lockActiveUser(
  trx: Knex.Transaction,
  userId: string,
): Promise<void> {
  const user = await trx("public.asmblyr_users")
    .where({ id: userId })
    .forUpdate()
    .first<{ status: string }>("status");
  if (user?.status !== "active") {
    throw new SsoError("SSO_AUTH_FAILED", "Account is unavailable");
  }
}

async function assignDefaultPolicies(
  trx: Knex.Transaction,
  userId: string,
  configuredPolicies: readonly string[],
): Promise<string[]> {
  if (configuredPolicies.length === 0) {
    return [];
  }

  const uuidEntries = configuredPolicies.filter((entry) =>
    UUID_PATTERN.test(entry),
  );
  const rows = await trx("public.asmblyr_policies")
    .where((query) => {
      query.whereIn("name", configuredPolicies);
      if (uuidEntries.length > 0) {
        query.orWhereIn("id", uuidEntries);
      }
    })
    .select<{ id: string }[]>("id");

  const policyIds = [...new Set(rows.map((row) => row.id))].sort();
  if (policyIds.length > 0) {
    await trx("public.asmblyr_user_policies")
      .insert(
        policyIds.map((policyId) => ({ policy_id: policyId, user_id: userId })),
      )
      .onConflict(["policy_id", "user_id"])
      .ignore();
  }
  return policyIds;
}

async function resolveInTransaction(
  trx: Knex.Transaction,
  provider: SsoProvider,
  identity: ExternalIdentity,
  profile: ExternalProfile,
  email: string,
  userAgent?: string,
): Promise<TokenPair> {
  await trx.raw("SELECT pg_advisory_xact_lock(?::bigint)", [
    advisoryLockKey(email),
  ]);

  const linked = await trx("public.asmblyr_user_identities")
    .where(identity)
    .first<{ user_id: string }>("user_id");
  if (linked) {
    await lockActiveUser(trx, linked.user_id);
    const tokens = await issueUserTokens(trx, linked.user_id, userAgent);
    await securityEvent(trx, linked.user_id, "user.sso_login", linked.user_id, {
      provider: identity.provider,
    });
    return tokens;
  }

  const existingUser = await trx("public.asmblyr_users")
    .where({ email })
    .forUpdate()
    .first<UserLookupRow>("id", "status", "superuser");

  if (existingUser) {
    if (!provider.autoLinkByEmail) {
      throw notLinkedError();
    }
    if (existingUser.status !== "active") {
      throw new SsoError("SSO_AUTH_FAILED", "Account is unavailable");
    }
    if (existingUser.superuser && !provider.requireVerifiedEmail) {
      throw notLinkedError();
    }

    const sameProvider = await trx("public.asmblyr_user_identities")
      .where({ user_id: existingUser.id, provider: identity.provider })
      .first("id");
    if (sameProvider) {
      throw new SsoError(
        "SSO_IDENTITY_CONFLICT",
        "A provider account is already linked",
      );
    }

    await trx("public.asmblyr_user_identities").insert({
      user_id: existingUser.id,
      ...identity,
    });
    await trx("public.asmblyr_user_invitations")
      .where({ user_id: existingUser.id })
      .whereNull("consumed_at")
      .update({ consumed_at: trx.fn.now() });

    const tokens = await issueUserTokens(trx, existingUser.id, userAgent);
    await securityEvent(
      trx,
      existingUser.id,
      "user.identity_auto_linked",
      existingUser.id,
      { provider: identity.provider },
    );
    await securityEvent(
      trx,
      existingUser.id,
      "user.sso_login",
      existingUser.id,
      { provider: identity.provider },
    );
    return tokens;
  }

  if (!provider.autoProvision) {
    throw notLinkedError();
  }

  const [created] = await trx("public.asmblyr_users")
    .insert({
      email,
      status: "active",
      superuser: false,
      first_name: profile.firstName,
      last_name: profile.lastName,
      display_name: profile.displayName,
    })
    .returning<{ id: string }[]>(["id"]);

  const policyIds = await assignDefaultPolicies(
    trx,
    created.id,
    provider.defaultPolicies,
  );
  await trx("public.asmblyr_user_identities").insert({
    user_id: created.id,
    ...identity,
  });

  const tokens = await issueUserTokens(trx, created.id, userAgent);
  await securityEvent(trx, created.id, "user.sso_provisioned", created.id, {
    provider: identity.provider,
    policyIds,
  });
  await securityEvent(trx, created.id, "user.sso_login", created.id, {
    provider: identity.provider,
  });
  return tokens;
}

export async function autoLinkOrProvision(
  db: Knex,
  provider: SsoProvider,
  identity: ExternalIdentity,
  profile: ExternalProfile,
  userAgent?: string,
): Promise<TokenPair> {
  if (!provider.autoLinkByEmail && !provider.autoProvision) {
    throw notLinkedError();
  }

  const email = eligibleEmailForSso(provider, profile);
  if (!email) {
    throw notLinkedError();
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction((trx) =>
        resolveInTransaction(
          trx,
          provider,
          identity,
          profile,
          email,
          userAgent,
        ),
      );
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) {
        continue;
      }
      if (isUniqueViolation(error)) {
        throw new SsoError(
          "SSO_IDENTITY_CONFLICT",
          "A provider account is already linked",
        );
      }
      throw error;
    }
  }

  throw notLinkedError();
}
