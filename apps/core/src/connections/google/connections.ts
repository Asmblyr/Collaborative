import { createHash } from "node:crypto";
import type { IntegrationService } from "../../integrations/service.js";
import { integrationError } from "../../integrations/types.js";
import { valueInput } from "../../integrations/validation.js";
import type {
  GoogleConnection,
  PersonalConnectionStatus,
} from "@asmblyr-collaborative/contracts";
import { withConnectionVault, type ConnectionVault } from "../vault.js";
import {
  GoogleProtocol,
  type GoogleConfig,
  type GoogleOAuthProtocol,
  type GoogleTokens,
} from "./protocol.js";

export interface ConnectionRow {
  provider: string;
  id: string;
  owner_id: string;
  subject: string;
  email: string;
  configuration: string;
  scopes: string[];
  status: string;
  created_at: Date;
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const requiredScopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];
export const unavailable = () =>
  integrationError("connection_reconnect_required", 409);

export class GoogleConnections {
  readonly protocol: GoogleOAuthProtocol;
  constructor(
    readonly settings: IntegrationService,
    readonly transport: typeof fetch = fetch,
    protocol?: GoogleOAuthProtocol,
  ) {
    this.protocol = protocol ?? new GoogleProtocol(transport);
  }
  async config(vault?: ConnectionVault): Promise<GoogleConfig> {
    const row = vault?.row ?? (await this.settings.row());
    const value = valueInput(
      "google",
      this.settings.values(row).google,
    ) as GoogleConnection;
    if (!value.enabled || !value.clientId || !value.redirectUri) {
      throw integrationError("connection_disabled", 409);
    }
    const secret = this.settings.locked("google")
      ? this.settings.providers.options.env.GOOGLE_WORKSPACE_CLIENT_SECRET
      : (await this.settings.reveal(row, "google")).clientSecret;
    if (!secret) {
      throw integrationError("connection_disabled", 409);
    }
    return {
      ...value,
      clientSecret: secret,
      fingerprint: hash(
        JSON.stringify([value.clientId, secret, value.redirectUri]),
      ),
    };
  }
  async status(owner: string): Promise<PersonalConnectionStatus> {
    const row = await this.settings
      .database<ConnectionRow>("asmblyr_connections")
      .withSchema("public")
      .where({ owner_id: owner, provider: "google" })
      .first();
    let fingerprint: string | null = null;
    let temporarilyUnavailable = false;
    try {
      fingerprint = (await this.config()).fingerprint;
    } catch (error) {
      if ((error as { code?: string }).code !== "connection_disabled") {
        temporarilyUnavailable = true;
      }
    }
    const connected = Boolean(
      row &&
        fingerprint &&
        row.configuration === fingerprint &&
        row.status === "connected",
    );
    return {
      provider: "google",
      enabled: temporarilyUnavailable || Boolean(fingerprint),
      unavailable: temporarilyUnavailable,
      connected,
      reconnect: Boolean(row && !connected),
      email: row?.email ?? null,
      connectedAt: row?.created_at?.toISOString() ?? null,
    };
  }
  /** Optional integration failure must not disable unrelated Core assistant tools. */
  async available(owner: string): Promise<boolean> {
    try {
      return (await this.status(owner)).connected;
    } catch {
      return false;
    }
  }
  async connection(
    vault: ConnectionVault,
    owner: string,
  ): Promise<ConnectionRow> {
    const user = await vault
      .db("asmblyr_users")
      .withSchema("public")
      .where({ id: owner, status: "active" })
      .first("id");
    const row = await vault
      .db<ConnectionRow>("asmblyr_connections")
      .withSchema("public")
      .where({ owner_id: owner, provider: "google" })
      .first();
    const config = await this.config(vault);
    if (
      !user ||
      !row ||
      row.status !== "connected" ||
      row.configuration !== config.fingerprint ||
      requiredScopes.some((scope) => !row.scopes.includes(scope))
    ) {
      throw unavailable();
    }
    return row;
  }
  async accessToken(
    owner: string,
  ): Promise<{ token: string; connectionId: string }> {
    const result = await withConnectionVault(this.settings, async (vault) => {
      const row = await this.connection(vault, owner);
      let tokens = await vault.read<GoogleTokens>(row.id, owner);
      if (tokens.expiresAt < Date.now() + 60000) {
        try {
          tokens = await this.protocol.refresh(
            await this.config(vault),
            tokens,
          );
        } catch (error) {
          if (
            (error as { code?: string; error?: string }).code ===
              "invalid_grant" ||
            (error as { error?: string }).error === "invalid_grant"
          ) {
            await vault
              .db("asmblyr_connections")
              .where({ id: row.id })
              .update({ status: "reconnect" });
            return null;
          }
          throw integrationError("connection_provider_unavailable", 503);
        }
        if (requiredScopes.some((scope) => !tokens.scopes.includes(scope))) {
          await vault
            .db("asmblyr_connections")
            .where({ id: row.id })
            .update({ status: "reconnect" });
          return null;
        }
        await vault.write(row.id, owner, tokens);
      }
      return { token: tokens.accessToken, connectionId: row.id };
    });
    if (!result) {
      throw unavailable();
    }
    return result;
  }
  async disconnect(
    owner: string,
  ): Promise<{ disconnected: true; revoked: boolean }> {
    const credentials = await withConnectionVault(
      this.settings,
      async (vault) => {
        const row = await vault
          .db<ConnectionRow>("asmblyr_connections")
          .where({ owner_id: owner, provider: "google" })
          .first();
        let token: string | undefined;
        let readable = true;
        if (row) {
          try {
            token = (await vault.read<GoogleTokens>(row.id, owner))
              .refreshToken;
          } catch {
            readable = false;
          }
        }
        const ids = await vault
          .db("asmblyr_connection_writes")
          .where({ owner_id: owner })
          .pluck("id");
        const flows = await vault
          .db("asmblyr_connection_flows")
          .where({ owner_id: owner })
          .pluck("id");
        for (const id of [...ids, ...flows, ...(row ? [row.id] : [])]) {
          await vault.remove(id, owner);
        }
        return { token, readable };
      },
    );
    let revoked = credentials.readable;
    if (credentials.token) {
      try {
        await this.protocol.revoke(credentials.token);
      } catch {
        revoked = false;
      }
    }
    return { disconnected: true, revoked };
  }
}
