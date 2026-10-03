import { randomUUID } from "node:crypto";
import { registerReadiness } from "./health/readiness.js";
import { registerPresenceRoutes } from "./presence/routes.js";
import { registerErrorHandler } from "./http/error-handler.js";
import Fastify from "fastify";
import knex from "knex";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerPasskeyRoutes } from "./auth/passkeys/routes.js";
import type { PasskeyConfig } from "./auth/passkeys/config.js";
import { privateLogger } from "./operations/logging.js";
import {
  registerCredentialLimits,
  defaultOperationLimits,
  type OperationLimits,
} from "./operations/limits.js";
import { registerUserRoutes } from "./auth/user-routes.js";
import { registerProfileRoutes } from "./auth/profile-routes.js";
import { registerServiceRoutes } from "./services/routes.js";
import { registerFederationRoutes } from "./services/federation-routes.js";
import { registerPreferenceRoutes } from "./preferences/routes.js";
import { registerTableViewRoutes } from "./preferences/table-view-routes.js";
import { registerWorkspaceRoutes } from "./workspaces/routes.js";
import { registerCollectionRoutes } from "./collections/routes.js";
import { registerItemRoutes } from "./items/routes.js";
import { registerItemRelationRoutes } from "./items/relation-routes.js";
import { registerFilterPresetRoutes } from "./items/filter-preset-routes.js";
import { registerPermissionRoutes } from "./permissions/routes.js";
import { registerPolicyRoutes } from "./policies/routes.js";
import { registerFileRoutes } from "./files/routes.js";
import type { FileStorage } from "./files/storage/types.js";
import { registerAssistantRoutes } from "./assistant/routes.js";
import type { AssistantService } from "./assistant/service.js";
import { registerSettingsAccessRoutes } from "./settings/access-routes.js";
import { registerSettingsRoutes } from "./settings/routes.js";
import { registerTermRoutes } from "./terms/routes.js";
import { registerSsoRoutes } from "./auth/sso/routes.js";
import { SsoService } from "./auth/sso/service.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import type { OAuthConfig } from "./oauth/config.js";
import { loadAccess } from "./permissions/access.js";
import { createPluginContext } from "./plugins/context.js";
import { PluginHooks } from "./plugins/hooks.js";
import { endpointLogger } from "./plugins/logger.js";
import { capabilityItems } from "./plugins/capabilities.js";
import { pluginSettingsValues } from "./plugins/settings-repository.js";
import { registerPluginSettingsRoutes } from "./plugins/settings-routes.js";
import { registerPluginBoundary } from "./plugins/routing.js";
import { registerPluginRoutes } from "./plugins/routes.js";
import type { LoadedPlugin } from "./plugins/definition.js";
import { installPluginCollections } from "./plugins/install-collections.js";
import { registerPluginUiRoutes } from "./plugins/ui-routes.js";
import { pluginActor } from "./plugins/actor.js";
import { PluginActions } from "./plugins/actions.js";
import { createActionItems } from "./plugins/action-items.js";
import { registerPluginDraftRoutes } from "./plugins/action-draft-routes.js";

interface AppOptions {
  operationLimits?: OperationLimits;
  passkeys?: PasskeyConfig;
  databaseUrl?: string;
  logger?: boolean;
  setupToken?: string;
  fileStorage?: FileStorage | null;
  assistant?: AssistantService | null;
  sso?: SsoService;
  oauth?: OAuthConfig;
  plugins?: readonly LoadedPlugin[];
}

export function createApp({
  databaseUrl,
  logger = true,
  setupToken,
  fileStorage = null,
  assistant = null,
  sso = new SsoService([]),
  oauth,
  plugins = [],
  operationLimits = defaultOperationLimits,
  passkeys = {
    rpId: "localhost",
    origin: "http://localhost:3000",
    rpName: "Asmblyr",
  },
}: AppOptions = {}) {
  const app = Fastify({
    logger: logger ? privateLogger : false,
    genReqId: () => randomUUID(),
  });
  registerErrorHandler(app);
  registerPluginBoundary(app);
  const database = databaseUrl
    ? knex({ client: "pg", connection: databaseUrl })
    : null;
  const hooks = new PluginHooks(plugins, endpointLogger(app.log));
  registerCredentialLimits(app, database);
  const actions = new PluginActions(plugins, async (access, scope, plugin) => {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return {
      actor: Object.freeze(
        plugin.capabilities?.includes("identity.profile")
          ? await pluginActor(database, access.principal)
          : { id: access.principal.id, kind: access.principal.kind },
      ),
      items: capabilityItems(
        plugin,
        createActionItems(database, access, scope, hooks.mutation),
      ),
      settings: await pluginSettingsValues(database, plugin),
    };
  });
  app.addHook("onReady", async () => {
    if (database) {
      await installPluginCollections(database, plugins);
    } else if (plugins.some((plugin) => plugin.collections?.length)) {
      throw new Error("Plugin collections require a database");
    }
  });

  registerCollectionRoutes(
    app,
    database,
    (transaction, access, requestId, target) =>
      hooks.emit(transaction, access, requestId, "collections.delete", target),
  );
  registerItemRoutes(app, database, hooks.mutation);
  registerItemRelationRoutes(app, database, hooks.mutation);
  registerFilterPresetRoutes(app, database);
  registerAuthRoutes(app, database, setupToken);
  registerPasskeyRoutes(app, database, passkeys, sso.providers);
  registerSsoRoutes(app, database, sso);
  registerOAuthRoutes(app, database, oauth);
  registerUserRoutes(app, database);
  registerProfileRoutes(app, database);
  registerPresenceRoutes(app, database);
  registerServiceRoutes(app, database);
  registerFederationRoutes(app, database);
  registerPreferenceRoutes(app, database);
  registerTableViewRoutes(app, database);
  registerWorkspaceRoutes(app, database);
  registerPolicyRoutes(app, database);
  registerPermissionRoutes(app, database);
  registerFileRoutes(app, database, fileStorage);
  registerAssistantRoutes(app, database, assistant, actions, operationLimits);
  registerSettingsAccessRoutes(app, database);
  registerSettingsRoutes(app, database, assistant);
  registerPluginSettingsRoutes(app, database, plugins);
  registerTermRoutes(app, database);

  app.get("/health", async () => ({ status: "ok", service: "core" }));

  registerReadiness(app, database);
  registerPluginUiRoutes(app, database, plugins);
  registerPluginDraftRoutes(app, database, actions);

  registerPluginRoutes(
    app,
    plugins,
    async (authorization, plugin, runtime) => {
      if (!database) {
        throw Object.assign(new Error("Database is not configured"), {
          statusCode: 503,
        });
      }
      const access = await loadAccess(database, authorization);
      return {
        access,
        ...(await createPluginContext(
          database,
          access,
          plugin,
          runtime,
          hooks.mutation,
        )),
      };
    },
    actions,
  );

  app.addHook("onClose", async () => {
    fileStorage?.close?.();
    await database?.destroy();
  });

  return app;
}
