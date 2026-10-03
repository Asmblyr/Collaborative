import type { Knex } from "knex";
import { errors, type AdapterPayload } from "oidc-provider";
import { digest } from "./crypto.js";

export function boundGrantHash(
  model: string,
  idHash: string,
  payload: AdapterPayload,
): string | null {
  if (model === "Grant") return idHash;
  // Interaction can refer to an old provider session, before the current Asmblyr user is known.
  if (!["AuthorizationCode", "AccessToken", "RefreshToken"].includes(model)) return null;
  return payload.grantId ? digest(payload.grantId) : null;
}

export async function findGrantBinding(db: Knex, hash: string) {
  return db("public.asmblyr_oauth_grants as grant")
    .join("public.asmblyr_oauth_consents as consent", "consent.id", "grant.consent_id")
    .where("grant.grant_hash", hash)
    .where("grant.expires_at", ">", db.fn.now())
    .first<{
      consent_id: string;
      app_id: string;
      user_id: string;
    }>("grant.consent_id", "consent.app_id", "consent.user_id");
}

export async function requireGrantBinding(db: Knex, hash: string, payload: AdapterPayload) {
  // Serializes state writes with revoke/edit, preventing late writes from restoring revoked codes.
  await db("public.asmblyr_oauth_apps").where({ id: payload.clientId }).forShare().first();
  const binding = await findGrantBinding(db, hash);
  if (!binding || binding.app_id !== payload.clientId || binding.user_id !== payload.accountId) {
    throw new errors.InvalidGrant("Application consent was revoked or expired");
  }
  return binding;
}
