import type { Knex } from "knex";
import { randomBytes, createHash } from "node:crypto";
import { securityEvent } from "../auth/security-events.js";
import { AuthInputError } from "../auth/validation.js";
import type { parseAccount, parseKey } from "./validation.js";
import { listFederations } from "./federation-repository.js";
import { requireAccount } from "./account-lookup.js";
import {
  requireDelegatedPolicies,
  requireManagedService,
} from "../policies/delegation-access.js";

const accounts = "asmblyr_service_accounts";
const keys = "asmblyr_service_keys";
const assignments = "asmblyr_service_policies";
const keyColumns = [
  "id",
  "name",
  "prefix",
  "created_at as createdAt",
  "expires_at as expiresAt",
  "last_used_at as lastUsedAt",
  "revoked_at as revokedAt",
];

export function secretHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
export function serviceSecret(prefix: "asm_sk_" | "asm_st_") {
  return prefix + randomBytes(32).toString("base64url");
}

function accountQuery(db: Knex) {
  return db(`${accounts} as account`)
    .withSchema("public")
    .select(
      "account.id",
      "account.name",
      "account.description",
      "account.status",
      "account.created_at as createdAt",
      db.raw(
        `COALESCE((SELECT array_agg(policy_id ORDER BY policy_id) FROM public.??
        WHERE service_id = account.id), ARRAY[]::uuid[]) AS "policyIds"`,
        [assignments],
      ),
    )
    .orderBy("account.created_at", "desc")
    .orderBy("account.id");
}

export async function listAccounts(db: Knex) {
  return accountQuery(db);
}

export async function accountDetail(db: Knex, id: string) {
  await requireAccount(db, id);
  const account = await accountQuery(db).where("account.id", id).first();
  return {
    ...account,
    federations: await listFederations(db, id),
    keys: await db(keys)
      .withSchema("public")
      .where({ service_id: id })
      .select(keyColumns)
      .orderBy("created_at", "desc"),
  };
}

export async function saveAccount(
  db: Knex,
  id: string | null,
  input: ReturnType<typeof parseAccount>,
  actorId: string,
) {
  return db.transaction(async (trx) => {
    if (id) {
      await requireAccount(trx, id, true);
    }
    await requireDelegatedPolicies(trx, actorId, "services", input.policyIds);
    if (id) {
      await requireManagedService(trx, actorId, id);
    }
    const policies = await trx("asmblyr_policies")
      .withSchema("public")
      .whereIn("id", input.policyIds)
      .forShare()
      .select("id");
    if (policies.length !== input.policyIds.length) {
      throw new AuthInputError("Policy not found");
    }
    const values = {
      name: input.name,
      description: input.description,
      status: input.status,
    };
    const [account] = id
      ? await trx(accounts)
          .withSchema("public")
          .where({ id })
          .update(values)
          .returning("id")
      : await trx(accounts).withSchema("public").insert(values).returning("id");
    await trx(assignments)
      .withSchema("public")
      .where({ service_id: account.id })
      .delete();
    if (input.policyIds.length) {
      await trx(assignments)
        .withSchema("public")
        .insert(
          input.policyIds.map((policyId) => ({
            service_id: account.id,
            policy_id: policyId,
          })),
        );
    }
    if (input.status === "disabled") {
      await trx("asmblyr_service_tokens")
        .withSchema("public")
        .whereIn(
          "key_id",
          trx(keys)
            .withSchema("public")
            .where({ service_id: account.id })
            .select("id"),
        )
        .orWhereIn(
          "federation_id",
          trx("asmblyr_service_federations")
            .where({ service_id: account.id })
            .select("id"),
        )
        .delete();
    }
    await securityEvent(
      trx,
      actorId,
      id ? "service.updated" : "service.created",
      account.id,
      values,
    );
    await securityEvent(trx, actorId, "service.policies_set", account.id, {
      policyIds: input.policyIds,
    });
    return accountDetail(trx, account.id);
  });
}

export async function createKey(
  db: Knex,
  id: string,
  input: ReturnType<typeof parseKey>,
  actorId: string,
) {
  return db.transaction(async (trx) => {
    const account = await requireAccount(trx, id, true);
    await requireManagedService(trx, actorId, id);
    if (account.status !== "active") {
      throw new AuthInputError("Service account is disabled");
    }
    const secret = serviceSecret("asm_sk_");
    const [key] = await trx(keys)
      .withSchema("public")
      .insert({
        service_id: id,
        name: input.name,
        prefix: secret.slice(0, 15),
        key_hash: secretHash(secret),
        expires_at: new Date(Date.now() + input.days * 86_400_000),
      })
      .returning(keyColumns);
    await securityEvent(trx, actorId, "service.key_created", id, {
      keyId: key.id,
      name: input.name,
    });
    return { ...key, secret };
  });
}

export async function revokeKey(
  db: Knex,
  id: string,
  keyId: string,
  actorId: string,
) {
  await db.transaction(async (trx) => {
    await requireAccount(trx, id, true);
    await requireManagedService(trx, actorId, id);
    const key = await trx(keys)
      .withSchema("public")
      .where({ id: keyId, service_id: id })
      .first("id", "revoked_at");
    if (!key) {
      throw Object.assign(new Error("Key not found"), { statusCode: 404 });
    }
    if (key.revoked_at) {
      return;
    }
    await trx(keys)
      .withSchema("public")
      .where({ id: keyId })
      .update({ revoked_at: trx.fn.now() });
    await trx("asmblyr_service_tokens")
      .withSchema("public")
      .where({ key_id: keyId })
      .delete();
    await securityEvent(trx, actorId, "service.key_revoked", id, { keyId });
  });
}
