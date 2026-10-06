import { createHash } from "node:crypto";
import type { Knex } from "knex";
import type {
  PluginSettingsSnapshot,
  PluginSettingsValues,
} from "@asmblyr-collaborative/contracts";
import { EndpointError } from "@asmblyr-collaborative/kit";
import { securityEvent } from "../auth/security-events.js";
import type { LoadedPlugin } from "./definition.js";
import {
  resolveSettingsValues,
  validateSettingsValues,
} from "./settings-validation.js";

interface SettingsRow {
  key: string;
  value: PluginSettingsValues;
  updated_at: string;
}

export async function pluginSettingsSnapshot(
  database: Knex,
  plugin: LoadedPlugin,
): Promise<PluginSettingsSnapshot> {
  if (!plugin.namespace || !plugin.settings) {
    throw new Error("Plugin has no settings");
  }
  const row = await database<SettingsRow>("asmblyr_settings")
    .withSchema("public")
    .where({ key: `plugin:${plugin.namespace}` })
    // Preserve PostgreSQL microseconds for consecutive changes within one millisecond.
    .first("value", database.raw("updated_at::text as updated_at"));
  return {
    namespace: plugin.namespace,
    packageName: plugin.name,
    definition: plugin.settings,
    values: resolveSettingsValues(plugin.settings, row?.value),
    revision: row
      ? createHash("sha256").update(JSON.stringify(row)).digest("hex")
      : null,
  };
}

export async function pluginSettingsValues(
  database: Knex,
  plugin: LoadedPlugin,
) {
  if (!plugin.settings) {
    return undefined;
  }
  return Object.freeze((await pluginSettingsSnapshot(database, plugin)).values);
}

export async function savePluginSettings(
  database: Knex,
  plugin: LoadedPlugin,
  actorId: string,
  input: unknown,
): Promise<PluginSettingsSnapshot> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["values", "revision"].includes(key))
  ) {
    throw new EndpointError(
      400,
      "PLUGIN_SETTINGS_INVALID",
      "Ожидаются значения настроек и их версия",
    );
  }
  const { values, revision } = input as Record<string, unknown>;
  if (
    revision !== null &&
    (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
  ) {
    throw new EndpointError(
      400,
      "PLUGIN_SETTINGS_INVALID",
      "Некорректная версия настроек",
    );
  }
  const checked = validateSettingsValues(plugin.settings!, values);
  return database.transaction(async (transaction) => {
    const key = `plugin:${plugin.namespace}`;
    await transaction.raw(
      "SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))",
      [key],
    );
    const current = await pluginSettingsSnapshot(transaction, plugin);
    if (revision !== current.revision) {
      throw new EndpointError(
        409,
        "PLUGIN_SETTINGS_CONFLICT",
        "Настройки уже изменились. Обновите форму перед сохранением.",
      );
    }
    await transaction("asmblyr_settings")
      .withSchema("public")
      .insert({ key, value: JSON.stringify(checked) })
      .onConflict("key")
      .merge({
        value: JSON.stringify(checked),
        updated_at: transaction.fn.now(),
      });
    await securityEvent(
      transaction,
      actorId,
      "settings.plugin.update",
      actorId,
      {
        namespace: plugin.namespace,
        fields: Object.keys(checked).filter(
          (key) => checked[key] !== current.values[key],
        ),
      },
    );
    return pluginSettingsSnapshot(transaction, plugin);
  });
}
