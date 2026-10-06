import { randomUUID } from "node:crypto";
import { registerReadiness } from "./health/readiness.js";
import { registerPresenceRoutes } from "./presence/routes.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerErrorHandler } from "./http/error-handler.js";
import Fastify from "fastify";
import knex from "knex";
import { postgresConnection } from "./postgres-connection.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerCliRoutes } from "./auth/cli/routes.js";
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
import { registerServiceActivity } from "./services/activity.js";
import { registerFederationRoutes } from "./services/federation-routes.js";
import { registerPreferenceRoutes } from "./preferences/routes.js";
import { registerTableViewRoutes } from "./preferences/table-view-routes.js";
import { registerWorkspaceRoutes } from "./workspaces/routes.js";
import { registerCollectionRoutes } from "./collections/routes.js";
import { registerTranslationRoutes } from "./translations/routes.js";
import { registerSchemaRoutes } from "./schema/routes.js";
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
import { IntegrationService } from "./integrations/service.js";
import { IntegrationRuntime } from "./integrations/runtime.js";
import { registerIntegrationRoutes } from "./integrations/routes.js";
import type { IntegrationOptions } from "./integrations/providers.js";
import { GoogleConnections } from "./connections/google/connections.js";
import type { GoogleOAuthProtocol } from "./connections/google/protocol.js";
import { personalConnections } from "./connections/broker.js";
import { registerConnectionRoutes } from "./connections/routes.js";
import { MonitoringRuntime } from "./monitoring/runtime.js";
import { registerMonitoringRoutes } from "./monitoring/routes.js";
import type { MonitoringSinkFactory } from "./monitoring/sentry.js";

interface AppOptions {
  monitoringSink?: MonitoringSinkFactory;
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
  integrations?: IntegrationOptions;
  googleProtocol?: GoogleOAuthProtocol;
}

export function createApp({
  monitoringSink,
  databaseUrl,
  logger = true,
  setupToken,
  fileStorage = null,
  assistant = null,
  integrations,
  googleProtocol,
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
  registerServiceActivity(app);
  registerPluginBoundary(app);
  const database = databaseUrl
    ? knex({ client: "pg", connection: postgresConnection(databaseUrl) })
    : null;
  const hooks = new PluginHooks(plugins, endpointLogger(app.log));
  const integrationSettings =
    database && integrations
      ? new IntegrationService(database, integrations)
      : null;
  const integrationRuntime = integrationSettings
    ? new IntegrationRuntime(integrationSettings)
    : null;
  const monitoring = integrationSettings
    ? new MonitoringRuntime(integrationSettings, monitoringSink)
    : null;
  monitoring?.register(app);
  const google = integrationSettings
    ? new GoogleConnections(
        integrationSettings,
        integrations?.exchange,
        googleProtocol,
      )
    : null;
  const storageSource = integrationRuntime?.storage ?? fileStorage;
  const assistantSource = integrationRuntime?.assistant ?? assistant;
  registerCredentialLimits(app, database);
  registerCliRoutes(app, database, passkeys.origin);
  const actions = new PluginActions(
    plugins,
    async (access, scope, plugin) => {
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
        ...(google &&
        access.principal.kind === "user" &&
        plugin.capabilities?.includes("connections.google")
          ? {
              connections: personalConnections(
                google,
                access.principal.id,
                scope.signal,
              ),
            }
          : {}),
      };
    },
    undefined,
    async (access) =>
      Boolean(google && (await google.available(access.principal.id))),
  );
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
  registerTranslationRoutes(app, database, plugins);
  registerSchemaRoutes(app, database, actions);
  registerItemRelationRoutes(app, database, hooks.mutation);
  registerFilterPresetRoutes(app, database);
  registerAuthRoutes(app, database, setupToken);
  registerPasskeyRoutes(app, database, passkeys, sso.providers);
  registerSsoRoutes(app, database, sso);
  registerOAuthRoutes(app, database, oauth);
  registerUserRoutes(app, database);
  registerProfileRoutes(app, database);
  registerPresenceRoutes(app, database);
  registerNotificationRoutes(app, database, plugins);
  registerServiceRoutes(app, database);
  registerFederationRoutes(app, database);
  registerPreferenceRoutes(app, database);
  registerTableViewRoutes(app, database);
  registerWorkspaceRoutes(app, database);
  registerPolicyRoutes(app, database);
  registerPermissionRoutes(app, database);
  registerFileRoutes(app, database, storageSource);
  registerAssistantRoutes(
    app,
    database,
    assistantSource,
    actions,
    operationLimits,
    google,
  );
  registerSettingsAccessRoutes(app, database);
  registerSettingsRoutes(app, database, assistantSource);
  registerIntegrationRoutes(app, database, integrationSettings, () =>
    monitoring?.refresh(),
  );
  registerMonitoringRoutes(app, database, monitoring);
  registerConnectionRoutes(app, database, google);
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
    integrationRuntime?.close();
    fileStorage?.close?.();
    await database?.destroy();
  });

  return app;
}
