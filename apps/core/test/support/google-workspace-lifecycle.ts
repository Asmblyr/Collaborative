import type { TestContext } from "node:test";
import type { GoogleWorkspaceFixture } from "./google-workspace.js";
import assert from "node:assert/strict";
import { loadAccess } from "../../src/permissions/access.js";
import { IntegrationService } from "../../src/integrations/service.js";
import { initialValues } from "../../src/integrations/types.js";
import { GoogleConnections } from "../../src/connections/google/connections.js";
import {
  startGoogleFlow,
  finishGoogleFlow,
} from "../../src/connections/google/flows.js";
import { requiredScopes } from "../../src/connections/google/connections.js";
import type { GoogleTokens } from "../../src/connections/google/protocol.js";
import { createContextTools } from "../../src/assistant/context-tools.js";

export async function googleLifecycleCases(
  t: TestContext,
  fixture: GoogleWorkspaceFixture,
) {
  const {
    db,
    settings,
    connections,
    owner,
    adminId,
    headers,
    member,
    connect,
    protocol,
    transport,
    options,
    state,
  } = fixture;
  await t.test(
    "missing refresh token is retained only for the same subject/client; partial scopes fail",
    async () => {
      state.grantRefresh = "";
      await connect();
      assert.equal(
        (await connections.accessToken(owner!)).token,
        "access-private",
      );
      state.grantRefresh = "refresh-private";
      state.grantScopes = [];
      await assert.rejects(connect(), { code: "connection_scopes_missing" });
      state.grantScopes = requiredScopes;
    },
  );
  await t.test(
    "refresh is serialized across requests; invalid_grant requests reconnect",
    async () => {
      const { withConnectionVault } = await import(
        "../../src/connections/vault.js"
      );
      const expire = () =>
        withConnectionVault(settings, async (vault) => {
          const row = await connections.connection(vault, owner!);
          const tokens = await vault.read<GoogleTokens>(row.id, owner!);
          await vault.write(row.id, owner!, { ...tokens, expiresAt: 0 });
        });
      await expire();
      await Promise.all([
        connections.accessToken(owner!),
        connections.accessToken(owner!),
      ]);
      assert.equal(state.refreshes, 1);
      await expire();
      state.invalidGrant = true;
      await assert.rejects(connections.accessToken(owner!), {
        code: "connection_reconnect_required",
      });
      assert.equal((await connections.status(owner!)).reconnect, true);
      state.invalidGrant = false;
    },
  );
  await t.test(
    "disconnect removes credentials/proposals/flows and configuration supports env locks",
    async () => {
      await connect();
      await connections.disconnect(owner!);
      assert.equal((await connections.status(owner!)).connected, false);
      assert.equal(
        (
          await db("asmblyr_connection_secrets")
            .where({ owner_id: owner! })
            .select()
        ).length,
        0,
      );
      const locked = new IntegrationService(db, {
        ...options,
        env: { GOOGLE_WORKSPACE_CLIENT_ID: "from-env" },
      });
      assert.equal((await locked.snapshot()).google.readOnly, true);
      await assert.rejects(locked.save("google", {}, adminId!), {
        code: "integration_environment_locked",
      });
    },
  );
  await t.test(
    "disconnect during OAuth exchange prevents a late callback from reconnecting",
    async () => {
      let release!: () => void;
      let entered!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const exchanging = new Promise<void>((resolve) => {
        entered = resolve;
      });
      state.exchangeHook = async () => {
        entered();
        await blocked;
      };
      const pending = connect();
      await exchanging;
      await connections.disconnect(owner!);
      release();
      await assert.rejects(pending, { code: "connection_invalid_flow" });
      state.exchangeHook = undefined;
      assert.equal((await connections.status(owner!)).connected, false);
    },
  );
  await t.test(
    "expired flow, changed configuration and a revoked session cannot finish authorization",
    async () => {
      const access = await loadAccess(db, member.authorization);
      const start = async () => {
        const flow = await startGoogleFlow(connections, owner!);
        return {
          browserToken: flow.browserToken,
          query: `state=${new URL(flow.url).searchParams.get("state")}&code=test`,
        };
      };
      const expired = await start();
      await db("asmblyr_connection_flows")
        .where({ owner_id: owner! })
        .update({ expires_at: new Date(0) });
      await assert.rejects(
        finishGoogleFlow(connections, access, expired, async () => access),
        { code: "connection_invalid_flow" },
      );
      const changed = await start();
      await settings.save(
        "google",
        {
          revision: (await settings.row()).revision,
          value: {
            enabled: true,
            clientId: "another-client",
            redirectUri: "http://localhost:3000/connections/google/callback",
          },
        },
        adminId!,
      );
      await assert.rejects(
        finishGoogleFlow(connections, access, changed, async () => access),
        { code: "connection_invalid_flow" },
      );
      await settings.save(
        "google",
        {
          revision: (await settings.row()).revision,
          value: {
            enabled: true,
            clientId: "client-id",
            redirectUri: "http://localhost:3000/connections/google/callback",
          },
        },
        adminId!,
      );
      const freshHeader = await headers(owner!);
      const freshAccess = await loadAccess(db, freshHeader.authorization);
      const revoked = await start();
      state.exchangeHook = async () => {
        await db("asmblyr_auth_sessions")
          .where({ user_id: owner! })
          .update({ revoked_at: new Date() });
      };
      await assert.rejects(
        finishGoogleFlow(connections, freshAccess, revoked, () =>
          loadAccess(db, freshHeader.authorization),
        ),
        { statusCode: 401 },
      );
      state.exchangeHook = undefined;
      assert.equal((await connections.status(owner!)).connected, false);
    },
  );
  await t.test(
    "env cipher overrides cannot rewrite vault metadata; local disconnect works without cipher access",
    async () => {
      const fresh = await headers(owner!);
      const flow = await startGoogleFlow(connections, owner!);
      const access = await loadAccess(db, fresh.authorization);
      await finishGoogleFlow(
        connections,
        access,
        {
          browserToken: flow.browserToken,
          query: `state=${new URL(flow.url).searchParams.get("state")}&code=test`,
        },
        async () => access,
      );
      const oldRow = await settings.row();
      const unavailableCipher = new IntegrationService(db, {
        ...options,
        cipher: () => {
          throw new Error("KMS unavailable");
        },
      });
      const unavailableGoogle = new GoogleConnections(
        unavailableCipher,
        transport,
        protocol,
      );
      assert.equal((await unavailableGoogle.status(owner!)).unavailable, true);
      const tools = await createContextTools(
        db,
        access,
        { page: "home", workspaceId: null },
        async () => access,
        undefined,
        unavailableGoogle,
      );
      try {
        assert.ok(
          tools?.definitions.some((tool) => tool.name === "list_collections"),
        );
        assert.equal(
          tools?.definitions.some((tool) =>
            tool.name.startsWith("plugin_google__"),
          ),
          false,
        );
      } finally {
        await tools?.close?.();
      }
      await db("asmblyr_integration_settings")
        .where({ id: 1 })
        .update({ secrets: "{}" });
      const overridden = new IntegrationService(db, {
        ...options,
        env: {
          SECRETS_PROVIDER: "yandex-kms",
          SECRETS_YC_KMS_KEY_ID: "other-key",
          SECRETS_YC_SERVICE_ACCOUNT_ID: "other-sa",
        },
      });
      await assert.rejects(
        overridden.save(
          "assistant",
          {
            revision: (await overridden.row()).revision,
            value: {
              ...initialValues.assistant,
              enabled: true,
              model: "gpt-test",
            },
            secrets: { apiKey: "new-private" },
          },
          adminId!,
        ),
        { code: "integration_encryption_migration_required" },
      );
      assert.deepEqual(await unavailableGoogle.disconnect(owner!), {
        disconnected: true,
        revoked: false,
      });
      assert.equal(
        (
          await db("asmblyr_connection_secrets")
            .where({ owner_id: owner! })
            .select()
        ).length,
        0,
      );
      await db("asmblyr_integration_settings")
        .where({ id: 1 })
        .update({ secrets: JSON.stringify(oldRow.secrets) });
    },
  );
}
