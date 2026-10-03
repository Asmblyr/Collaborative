import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { EndpointError } from "@asmblyr/kit";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import type { LoadedPlugin } from "./definition.js";
import {
  pluginSettingsSnapshot,
  savePluginSettings,
} from "./settings-repository.js";

export function registerPluginSettingsRoutes(
  app: FastifyInstance,
  database: Knex | null,
  plugins: readonly LoadedPlugin[],
) {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  async function authorize(authorization?: string) {
    const user = await requireSettingsSection(
      db(),
      { headers: { authorization } },
      "plugins",
    );
    return user.id;
  }
  function find(namespace: string) {
    const plugin = plugins.find(
      (entry) => entry.namespace === namespace && entry.settings,
    );
    if (!plugin) {
      throw new EndpointError(
        404,
        "PLUGIN_NOT_FOUND",
        "Настройки плагина недоступны",
      );
    }
    return plugin;
  }
  app.get("/settings/plugins", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "plugins");
    return {
      data: await Promise.all(
        plugins.map(async (plugin) => ({
          name: plugin.name,
          namespace: plugin.namespace ?? null,
          capabilities: plugin.capabilities ?? [],
          settings: plugin.settings
            ? await pluginSettingsSnapshot(db(), plugin)
            : null,
        })),
      ),
    };
  });
  app.get<{ Params: { namespace: string } }>(
    "/settings/plugins/:namespace",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await requireSettingsRead(db(), request, "plugins");
      return {
        data: await pluginSettingsSnapshot(
          db(),
          find(request.params.namespace),
        ),
      };
    },
  );
  app.put<{ Params: { namespace: string } }>(
    "/settings/plugins/:namespace",
    { bodyLimit: 64_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actorId = await authorize(request.headers.authorization);
      return {
        data: await savePluginSettings(
          db(),
          find(request.params.namespace),
          actorId,
          request.body,
        ),
      };
    },
  );
}
