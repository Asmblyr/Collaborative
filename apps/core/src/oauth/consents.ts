import { randomBytes, randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { securityEvent } from "../auth/security-events.js";
import type { OAuthApplications } from "./applications.js";
import { digest } from "./crypto.js";

interface ConsentRow {
  id: string;
  app_id: string;
  user_id: string;
  audience: string;
  scopes: string[];
  approved_at: Date;
  last_used_at: Date | null;
}

export interface ConsentRequest {
  scopes: string[];
  forceConsent: boolean;
}

export function consentRequest(params: {
  scope?: unknown;
  prompt?: unknown;
}): ConsentRequest {
  return {
    scopes: [
      ...new Set(
        String(params.scope ?? "")
          .split(" ")
          .filter(Boolean),
      ),
    ].sort(),
    forceConsent: String(params.prompt ?? "")
      .split(" ")
      .includes("consent"),
  };
}

function covers(
  row: ConsentRow | undefined,
  audience: string,
  request: ConsentRequest,
): boolean {
  return Boolean(
    row &&
      !request.forceConsent &&
      row.audience === audience &&
      request.scopes.every((scope) => row.scopes.includes(scope)),
  );
}

export class OAuthConsents {
  constructor(
    private readonly db: Knex,
    private readonly apps?: OAuthApplications,
  ) {}

  async canReuse(
    appId: string,
    userId: string,
    request: ConsentRequest,
  ): Promise<boolean> {
    const app = await this.apps?.row(appId);
    if (!app || !(await this.apps?.allowed(appId, userId))) return false;
    const row = await this.db<ConsentRow>("public.asmblyr_oauth_consents")
      .where({ app_id: appId, user_id: userId })
      .first();
    return covers(row, app.audience, request);
  }

  async authorize(
    appId: string,
    userId: string,
    request: ConsentRequest,
    reuse: boolean,
  ) {
    return this.db.transaction(async (trx) => {
      // Same lock order as application edits and personal revocation.
      const app = await trx("public.asmblyr_oauth_apps")
        .where({ id: appId })
        .forUpdate()
        .first<{ id: string; audience: string }>("id", "audience");
      if (!app || !(await this.apps?.allowed(appId, userId, trx))) {
        throw Object.assign(new Error("Application access denied"), {
          statusCode: 403,
        });
      }
      let row = await trx<ConsentRow>("public.asmblyr_oauth_consents")
        .where({ app_id: appId, user_id: userId })
        .first();
      if (reuse && !covers(row, app.audience, request)) {
        throw Object.assign(
          new Error("Согласие изменилось. Подтвердите доступ заново."),
          {
            statusCode: 409,
          },
        );
      }
      if (!reuse) {
        const previousScopes =
          row && row.audience === app.audience ? row.scopes : [];
        const scopes = [
          ...new Set([...previousScopes, ...request.scopes]),
        ].sort();
        const values = {
          id: row?.id ?? randomUUID(),
          app_id: appId,
          user_id: userId,
          audience: app.audience,
          scopes: trx.raw("?::jsonb", [JSON.stringify(scopes)]),
          approved_at: trx.fn.now(),
        };
        [row] = await trx<ConsentRow>("public.asmblyr_oauth_consents")
          .insert(values)
          .onConflict(["app_id", "user_id"])
          .merge(values)
          .returning("*");
        await securityEvent(trx, userId, "oauth.consent_granted", appId, {
          scopes: request.scopes,
        });
      }
      const grantId = randomBytes(32).toString("base64url");
      await trx("public.asmblyr_oauth_grants").insert({
        grant_hash: digest(grantId),
        consent_id: row!.id,
        expires_at: new Date(Date.now() + 600_000),
      });
      return { grantId, audience: app.audience };
    });
  }

  async list(userId: string) {
    const rows = await this.db<ConsentRow>(
      "public.asmblyr_oauth_consents as consent",
    )
      .join("public.asmblyr_oauth_apps as app", "app.id", "consent.app_id")
      .where("consent.user_id", userId)
      .orderBy("consent.approved_at", "desc")
      .select<
        (ConsentRow & { name: string; description: string; enabled: boolean })[]
      >("consent.*", "app.name", "app.description", "app.enabled");
    return rows.map((row) => ({
      id: row.app_id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      audience: row.audience,
      scopes: row.scopes,
      approvedAt: row.approved_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  async revoke(appId: string, userId: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx("public.asmblyr_oauth_apps")
        .where({ id: appId })
        .forUpdate()
        .first();
      const consent = await trx<ConsentRow>("public.asmblyr_oauth_consents")
        .where({ app_id: appId, user_id: userId })
        .first();
      if (!consent) return;
      const grants = await trx("public.asmblyr_oauth_grants")
        .where({ consent_id: consent.id })
        .pluck<string[]>("grant_hash");
      await trx("public.asmblyr_oauth_consents")
        .where({ id: consent.id })
        .delete();
      await trx("public.asmblyr_oauth_state")
        .whereIn("grant_hash", grants)
        .orWhere((query) =>
          query.where({ model: "Grant" }).whereIn("id_hash", grants),
        )
        .delete();
      await securityEvent(trx, userId, "oauth.consent_revoked", appId);
    });
  }
}
