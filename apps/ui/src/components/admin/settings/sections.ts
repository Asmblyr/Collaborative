import type { SettingsSection } from "@asmblyr-collaborative/contracts";

export const settingsCatalog: readonly {
  id: SettingsSection;
  title: string;
  description: string;
  group: "Команда" | "Возможности" | "Интеграции";
}[] = [
  {
    id: "files",
    title: "Файлы",
    description:
      "Просмотр общей библиотеки. Управление разрешает загрузку, переименование и удаление свободных файлов.",
    group: "Возможности",
  },
  {
    id: "users",
    title: "Пользователи",
    description: "Приглашения, список пользователей и просмотр их доступа.",
    group: "Команда",
  },
  {
    id: "policies",
    title: "Политики доступа",
    description:
      "Права на данные и разделы системы. Изменение разрешает назначать готовые политики из заданного набора.",
    group: "Команда",
  },
  {
    id: "plugins",
    title: "Расширения",
    description:
      "Установленные плагины, их настройки и разрешённые возможности.",
    group: "Возможности",
  },
  {
    id: "assistant",
    title: "AI-ассистент",
    description: "Параметры моделей, инструкции и статистика использования.",
    group: "Возможности",
  },
  {
    id: "terms",
    title: "Термины",
    description: "Общий словарь понятий для работы ассистента с данными.",
    group: "Возможности",
  },
  {
    id: "services",
    title: "Сервисные аккаунты",
    description:
      "Ключи, федерации и готовые политики. Управление ограничено разрешённым набором политик пользователя.",
    group: "Интеграции",
  },
  {
    id: "oauth",
    title: "OAuth-приложения",
    description: "Подключение внешних сервисов ко входу через Asmblyr.",
    group: "Интеграции",
  },
];

export const integrationSettingsEntry = {
  id: "integrations" as const,
  title: "Подключения",
  description:
    "Хранилище файлов, AI-провайдер и защита секретов. Только для суперпользователя.",
  group: "Интеграции" as const,
};

export const monitoringSettingsEntry = {
  id: "monitoring" as const,
  title: "Мониторинг",
  description:
    "Sentry, ошибки и производительность. Только для суперпользователя.",
  group: "Интеграции" as const,
};

export function settingsHref(
  section: SettingsSection | "integrations" | "monitoring",
): string {
  if (section === "files") {
    return "/files";
  }
  return `/admin/settings/${section}`;
}

export function availableSettings(
  sections: readonly SettingsSection[],
): (typeof settingsCatalog)[number][];
export function availableSettings(
  sections: readonly SettingsSection[],
  superuser: boolean,
): (
  | (typeof settingsCatalog)[number]
  | typeof integrationSettingsEntry
  | typeof monitoringSettingsEntry
)[];
export function availableSettings(
  sections: readonly SettingsSection[],
  superuser = false,
) {
  const visible = settingsCatalog.filter((entry) =>
    sections.includes(entry.id),
  );
  return superuser
    ? [...visible, integrationSettingsEntry, monitoringSettingsEntry]
    : visible;
}

/** File-library access is a permission, not a system settings page. */
export function settingsPages(
  sections: readonly SettingsSection[],
  superuser = false,
) {
  return availableSettings(sections, superuser).filter(
    (entry) => entry.id !== "files",
  );
}
