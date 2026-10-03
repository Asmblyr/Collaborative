import type { Knex } from "knex";
import type { JWTVerifyGetKey } from "jose";
import { InvalidCredentialsError } from "../auth/validation.js";
import { secretHash, serviceSecret } from "./repository.js";
import {
  verifyGitlabAssertion,
  type FederationBinding,
} from "./federation-verifier.js";

export async function exchangeFederation(
  db: Knex,
  input: unknown,
  keys?: JWTVerifyGetKey,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new InvalidCredentialsError();
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).length !== 2 ||
    typeof body.federationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.federationId,
    ) ||
    typeof body.assertion !== "string" ||
    body.assertion.length > 16000
  )
    throw new InvalidCredentialsError();
  const binding = await db("asmblyr_service_federations")
    .where({ id: body.federationId, revoked_at: null })
    .first<FederationBinding>();
  if (!binding) throw new InvalidCredentialsError();
  // Remote JWKS verification deliberately precedes the account lock.
  const assertion = await verifyGitlabAssertion(body.assertion, binding, keys);
  return db.transaction(async (trx) => {
    const account = await trx("asmblyr_service_accounts")
      .where({ id: binding.service_id })
      .forUpdate()
      .first();
    const live = await trx("asmblyr_service_federations")
      .where({ id: binding.id, revoked_at: null })
      .first();
    const expiresAt = Math.min(Date.now() + 900000, assertion.expiresAt);
    const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);
    if (!account || account.status !== "active" || !live || expiresIn < 1)
      throw new InvalidCredentialsError();
    await trx("asmblyr_federation_assertions")
      .whereIn(
        "jti_hash",
        trx("asmblyr_federation_assertions")
          .where("expires_at", "<=", trx.fn.now())
          .orderBy("expires_at")
          .limit(500)
          .select("jti_hash"),
      )
      .delete();
    const used = await trx("asmblyr_federation_assertions")
      .insert({
        jti_hash: secretHash(assertion.jti),
        expires_at: new Date(assertion.expiresAt),
      })
      .onConflict("jti_hash")
      .ignore()
      .returning("jti_hash");
    if (!used.length) throw new InvalidCredentialsError();
    await trx("asmblyr_service_tokens")
      .where({ federation_id: binding.id })
      .where("expires_at", "<=", trx.fn.now())
      .delete();
    const accessToken = serviceSecret("asm_st_");
    await trx("asmblyr_service_tokens").insert({
      token_hash: secretHash(accessToken),
      federation_id: binding.id,
      expires_at: new Date(expiresAt),
    });
    await trx("asmblyr_service_federations")
      .where({ id: binding.id })
      .update({ last_used_at: trx.fn.now() });
    return { tokenType: "Bearer", accessToken, expiresIn };
  });
}
