import type { Knex } from "knex";
import { errors, type AdapterPayload } from "oidc-provider";
import { digest, type OAuthCipher } from "./crypto.js";
import type { OAuthApplications } from "./applications.js";
import { boundGrantHash, findGrantBinding, requireGrantBinding } from "./grant-bindings.js";
import { securityEvent } from "../auth/security-events.js";

interface StateRow {
  model: string;
  uid_hash: string | null;
  id_hash: string;
  payload: string;
  consumed_at: Date | null;
}

export function oauthAdapter(db: Knex, cipher: OAuthCipher, apps: OAuthApplications) {
  return class DatabaseAdapter {
    constructor(private readonly model: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn = 600): Promise<void> {
      const idHash = digest(id);
      const values = {
        model: this.model,
        id_hash: idHash,
        payload: cipher.seal(payload, `${this.model}:${idHash}`),
        expires_at: new Date(Date.now() + expiresIn * 1000),
        grant_hash: payload.grantId ? digest(payload.grantId) : null,
        uid_hash: payload.uid ? digest(payload.uid) : null,
        client_id: payload.clientId ?? payload.params?.client_id ?? null,
      };
      await db.transaction(async (trx) => {
        const grantHash = boundGrantHash(this.model, idHash, payload);
        if (grantHash) {
          const binding = await requireGrantBinding(trx, grantHash, payload);
          if (this.model === "AuthorizationCode") {
            await trx("public.asmblyr_oauth_consents")
              .where({ id: binding.consent_id })
              .update({ last_used_at: trx.fn.now() });
            await securityEvent(
              trx,
              binding.user_id,
              "oauth.application_authorized",
              binding.app_id,
            );
          }
        }
        await trx("public.asmblyr_oauth_state")
          .insert(values)
          .onConflict(["model", "id_hash"])
          .merge(values);
      });
    }

    private query() {
      return db<StateRow>("public.asmblyr_oauth_state")
        .where({ model: this.model })
        .where("expires_at", ">", db.fn.now());
    }

    private async decode(row: StateRow | undefined): Promise<AdapterPayload | undefined> {
      if (!row) return undefined;
      const payload = cipher.open<AdapterPayload>(row.payload, `${this.model}:${row.id_hash}`);
      const grantHash = boundGrantHash(this.model, row.id_hash, payload);
      if (grantHash && !(await findGrantBinding(db, grantHash))) return undefined;
      if (row.consumed_at) payload.consumed = Math.floor(row.consumed_at.getTime() / 1000);
      return payload;
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
      if (this.model === "Client") return apps.client(id);
      return this.decode(
        await this.query()
          .where({ id_hash: digest(id) })
          .first(),
      );
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.decode(
        await this.query()
          .where({ uid_hash: digest(uid) })
          .first(),
      );
    }

    async findByUserCode(): Promise<undefined> {
      return undefined;
    }

    async consume(id: string): Promise<void> {
      const updated = await this.query()
        .where({ id_hash: digest(id) })
        .whereNull("consumed_at")
        .update({ consumed_at: db.fn.now() });
      if (!updated) throw new errors.InvalidGrant("Code already consumed or expired");
    }

    async destroy(id: string): Promise<void> {
      await db("public.asmblyr_oauth_state")
        .where({ model: this.model, id_hash: digest(id) })
        .delete();
    }

    async revokeByGrantId(id: string): Promise<void> {
      await db("public.asmblyr_oauth_state")
        .where({ grant_hash: digest(id) })
        .delete();
    }
  };
}
