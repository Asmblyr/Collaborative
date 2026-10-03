import type { Knex } from "knex";

/** Called under the user's update lock; invalidates all previously issued access. */
export async function clearRecoveredAccess(
  trx: Knex.Transaction,
  userId: string,
): Promise<void> {
  await trx("public.asmblyr_auth_sessions")
    .where({ user_id: userId, revoked_at: null })
    .update({ revoked_at: trx.fn.now() });
  await trx("public.asmblyr_password_credentials")
    .where({ user_id: userId })
    .delete();
  await trx("public.asmblyr_passkeys").where({ user_id: userId }).delete();
  await trx("public.asmblyr_user_identities")
    .where({ user_id: userId })
    .delete();
  await trx("public.asmblyr_user_invitations")
    .where({ user_id: userId })
    .update({ consumed_at: trx.fn.now() });
  const grants = await trx("public.asmblyr_oauth_grants as grant")
    .join(
      "public.asmblyr_oauth_consents as consent",
      "consent.id",
      "grant.consent_id",
    )
    .where("consent.user_id", userId)
    .pluck<string[]>("grant.grant_hash");
  await trx("public.asmblyr_oauth_consents")
    .where({ user_id: userId })
    .delete();
  await trx("public.asmblyr_oauth_state")
    .whereIn("grant_hash", grants)
    .orWhere((query) =>
      query.where({ model: "Grant" }).whereIn("id_hash", grants),
    )
    .delete();
}
