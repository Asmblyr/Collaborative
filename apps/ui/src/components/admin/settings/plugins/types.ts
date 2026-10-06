import type { PluginSettingsSnapshot } from "@asmblyr-collaborative/contracts";

export interface PluginSettingsEntry {
  name: string;
  title?: string;
  namespace: string | null;
  capabilities: string[];
  settings: PluginSettingsSnapshot | null;
}

export function pluginTitle(plugin: PluginSettingsEntry): string {
  return (
    plugin.title ??
    plugin.settings?.definition.title ??
    plugin.namespace ??
    plugin.name
  );
}

export const capabilityLabels: Record<string, string> = {
  "identity.profile": "Имя текущего пользователя",
  "items.read": "Чтение данных в рамках прав пользователя",
  "items.write": "Запись данных в рамках прав пользователя",
  "collections.manage": "Создание и миграции собственных таблиц",
  "storage.own": "Доступ к собственному хранилищу",
  "hooks.items": "События записей",
  "hooks.collections": "События коллекций",
  settings: "Собственные настройки",
};
