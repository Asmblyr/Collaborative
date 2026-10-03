import { randomBytes, randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { ClientMetadata } from "oidc-provider";
import { securityEvent } from "../auth/security-events.js";
import { AuthInputError } from "../auth/validation.js";
import type { ApplicationInput } from "./input.js";
import type { OAuthCipher } from "./crypto.js";
import { matchesEmailDomain, type ApplicationAccessMode } from "./access.js";

interface ApplicationRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  access_mode: ApplicationAccessMode;
  email_domains: string[];
  client_type: "public" | "confidential";
  redirect_uris: string[];
  audience: string;
  scopes: string[];
  secret: string | null;
  created_at: Date;
}

export class OAuthApplications {
  constructor(
    private readonly db: Knex,
    private readonly cipher: OAuthCipher,
  ) {}

  async row(id: string): Promise<ApplicationRow | undefined> {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return undefined;
    return this.db<ApplicationRow>("public.asmblyr_oauth_apps").where({ id }).first();
  }

  async list() {
    const rows = await this.db<ApplicationRow>("public.asmblyr_oauth_apps").orderBy(
      "created_at",
      "desc",
    );
    const memberships = await this.db("public.asmblyr_oauth_app_users").select<
      { app_id: string; user_id: string }[]
    >("app_id", "user_id");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      accessMode: row.access_mode,
      emailDomains: row.email_domains,
      clientType: row.client_type,
      redirectUris: row.redirect_uris,
      audience: row.audience,
      scopes: row.scopes,
      createdAt: row.created_at,
      userIds: memberships
        .filter((membership) => membership.app_id === row.id)
        .map((membership) => membership.user_id),
    }));
  }

  async allowed(clientId: string, userId: string, database: Knex = this.db): Promise<boolean> {
    const result = await database("public.asmblyr_oauth_apps as app")
      .join("public.asmblyr_users as usr", (join) => join.onVal("usr.id", userId))
      .leftJoin("public.asmblyr_oauth_app_users as membership", (join) => {
        join.on("membership.app_id", "app.id").andOn("membership.user_id", "usr.id");
      })
      .where({ "app.id": clientId, "app.enabled": true, "usr.id": userId, "usr.status": "active" })
      .first<{
        access_mode: ApplicationAccessMode;
        email_domains: string[];
        email: string;
        selected_user: string | null;
      }>(
        "app.access_mode",
        "app.email_domains",
        "usr.email",
        "membership.user_id as selected_user",
      );
    if (!result) return false;
    if (result.access_mode === "all") return true;
    if (result.access_mode === "selected") return result.selected_user !== null;
    if (result.access_mode === "domains") {
      return (
        result.selected_user !== null || matchesEmailDomain(result.email, result.email_domains)
      );
    }
    return false;
  }

  async client(id: string): Promise<ClientMetadata | undefined> {
    const row = await this.row(id);
    if (!row?.enabled) return undefined;
    return {
      client_id: row.id,
      client_name: row.name,
      redirect_uris: row.redirect_uris,
      client_secret: row.secret ? this.cipher.open<string>(row.secret, `client:${id}`) : undefined,
      token_endpoint_auth_method: row.client_type === "public" ? "none" : "client_secret_basic",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "openid profile email",
      id_token_signed_response_alg: "RS256",
    };
  }

  async save(id: string | null, input: ApplicationInput, actorId: string) {
    const clientId = id ?? randomUUID();
    let clientSecret: string | undefined;
    await this.db.transaction(async (trx) => {
      const previous = id
        ? await trx<ApplicationRow>("public.asmblyr_oauth_apps").where({ id }).forUpdate().first()
        : undefined;
      if (id && !previous)
        throw Object.assign(new Error("Application not found"), { statusCode: 404 });
      if (previous && previous.client_type !== input.clientType)
        throw new AuthInputError("Client type cannot be changed");
      const users = await trx("public.asmblyr_users").whereIn("id", input.userIds).select("id");
      if (users.length !== input.userIds.length) throw new AuthInputError("Unknown user");
      if (!id && input.clientType === "confidential")
        clientSecret = randomBytes(32).toString("base64url");
      const values = {
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        access_mode: input.accessMode,
        email_domains: JSON.stringify(input.emailDomains),
        client_type: input.clientType,
        redirect_uris: JSON.stringify(input.redirectUris),
        audience: input.audience,
        scopes: JSON.stringify(input.scopes),
        updated_at: trx.fn.now(),
      };
      if (id) {
        await trx("public.asmblyr_oauth_apps").where({ id }).update(values);
        const recipientChanged =
          previous!.audience !== input.audience ||
          input.redirectUris.some((uri) => !previous!.redirect_uris.includes(uri));
        if (recipientChanged) {
          await trx("public.asmblyr_oauth_consents").where({ app_id: id }).delete();
        }
        await this.clearState(trx, id);
        await trx("public.asmblyr_oauth_app_users").where({ app_id: id }).delete();
      } else {
        await trx("public.asmblyr_oauth_apps").insert({
          ...values,
          id: clientId,
          secret: clientSecret ? this.cipher.seal(clientSecret, `client:${clientId}`) : null,
        });
      }
      if (input.userIds.length)
        await trx("public.asmblyr_oauth_app_users").insert(
          input.userIds.map((userId) => ({ app_id: clientId, user_id: userId })),
        );
      await securityEvent(
        trx,
        actorId,
        id ? "oauth.application_updated" : "oauth.application_created",
        clientId,
      );
    });
    return { application: (await this.list()).find((app) => app.id === clientId)!, clientSecret };
  }

  async rotateSecret(id: string, actorId: string): Promise<string> {
    const secret = randomBytes(32).toString("base64url");
    await this.db.transaction(async (trx) => {
      const updated = await trx("public.asmblyr_oauth_apps")
        .where({ id, client_type: "confidential" })
        .update({ secret: this.cipher.seal(secret, `client:${id}`), updated_at: trx.fn.now() });
      if (!updated) throw new AuthInputError("Confidential application not found");
      await this.clearState(trx, id);
      await securityEvent(trx, actorId, "oauth.secret_rotated", id);
    });
    return secret;
  }

  private async clearState(trx: Knex.Transaction, appId: string): Promise<void> {
    await trx("public.asmblyr_oauth_grants")
      .whereIn(
        "consent_id",
        trx("public.asmblyr_oauth_consents").where({ app_id: appId }).select("id"),
      )
      .delete();
    await trx("public.asmblyr_oauth_state").where({ client_id: appId }).delete();
  }
}
