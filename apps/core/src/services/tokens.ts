import type { Knex } from "knex";
import { InvalidCredentialsError } from "../auth/validation.js";
import { secretHash, serviceSecret } from "./repository.js";
import { recordServiceRequest } from "./activity.js";

export interface AuthenticatedService {
  kind: "service";
  id: string;
  keyId: string | null;
  federationId: string | null;
  superuser: false;
}

export async function exchangeServiceKey(db: Knex, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("key" in value) ||
    typeof value.key !== "string" ||
    !/^asm_sk_[A-Za-z0-9_-]{43}$/.test(value.key)
  ) {
    throw new InvalidCredentialsError();
  }
  const hash = secretHash(value.key);
  const lookup = await db("asmblyr_service_keys")
    .withSchema("public")
    .where({ key_hash: hash })
    .first<{ service_id: string }>("service_id");
  if (!lookup) {
    throw new InvalidCredentialsError();
  }
  return db.transaction(async (trx) => {
    const account = await trx("asmblyr_service_accounts")
      .withSchema("public")
      .where({ id: lookup.service_id })
      .forUpdate()
      .first<{ status: string }>("status");
    if (!account || account.status !== "active") {
      throw new InvalidCredentialsError();
    }
    const key = await trx("asmblyr_service_keys")
      .withSchema("public")
      .where({ key_hash: hash, revoked_at: null })
      .where("expires_at", ">", trx.fn.now())
      .first<{ id: string; expires_at: Date }>("id", "expires_at");
    if (!key) {
      throw new InvalidCredentialsError();
    }
    const expiresIn = Math.min(
      900,
      Math.floor((key.expires_at.getTime() - Date.now()) / 1000),
    );
    if (expiresIn < 1) {
      throw new InvalidCredentialsError();
    }
    const accessToken = serviceSecret("asm_st_");
    // Opportunistic bounded cleanup; a busy credential cannot accumulate expired grants forever.
    await trx("asmblyr_service_tokens")
      .withSchema("public")
      .where({ key_id: key.id })
      .where("expires_at", "<=", trx.fn.now())
      .delete();
    await trx("asmblyr_service_tokens")
      .withSchema("public")
      .insert({
        token_hash: secretHash(accessToken),
        key_id: key.id,
        expires_at: new Date(Date.now() + expiresIn * 1000),
      });
    await trx("asmblyr_service_keys")
      .withSchema("public")
      .where({ id: key.id })
      .update({
        last_used_at: trx.raw("clock_timestamp()"),
        last_activity_at: trx.raw(
          "greatest(last_activity_at, clock_timestamp())",
        ),
      });
    return { tokenType: "Bearer", accessToken, expiresIn };
  });
}

export async function authenticateService(
  db: Knex,
  authorization: string,
): Promise<AuthenticatedService> {
  const match = /^Bearer (asm_st_[A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match) {
    throw new InvalidCredentialsError();
  }
  const row = await db("asmblyr_service_tokens as token")
    .withSchema("public")
    .leftJoin("asmblyr_service_keys as key", "key.id", "token.key_id")
    .leftJoin(
      "asmblyr_service_federations as federation",
      "federation.id",
      "token.federation_id",
    )
    .join("asmblyr_service_accounts as account", function () {
      this.on(
        "account.id",
        "=",
        db.raw("coalesce(key.service_id, federation.service_id)"),
      );
    })
    .where("token.token_hash", secretHash(match[1]))
    .where("account.status", "active")
    .where(function () {
      this.where(function () {
        this.whereNotNull("key.id")
          .whereNull("key.revoked_at")
          .where("key.expires_at", ">", db.fn.now());
      }).orWhere(function () {
        this.whereNotNull("federation.id").whereNull("federation.revoked_at");
      });
    })
    .where("token.expires_at", ">", db.fn.now())
    .first<{ id: string; keyId: string | null; federationId: string | null }>(
      "account.id",
      "key.id as keyId",
      "federation.id as federationId",
    );
  if (!row) {
    throw new InvalidCredentialsError();
  }
  if (row.keyId) {
    await recordServiceRequest(db, row.keyId);
  }
  return { kind: "service", ...row, superuser: false };
}
