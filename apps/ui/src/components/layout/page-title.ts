import {
  settingsCatalog,
  settingsHref,
} from "@/components/system-settings/sections";

const titles: Record<string, string> = {
  "/files": "Файлы",
  "/services": "Сервисные аккаунты",
  "/oauth-apps": "OAuth-приложения",
  "/settings": "Настройки пользователя",
  "/access": "Доступ",
  "/search": "Поиск",
};

export function pageTitle(
  pathname: string,
  collection?: { name: string; displayName?: string | null },
): string {
  if (pathname.startsWith("/system-settings")) {
    const section = settingsCatalog.find(
      (entry) => settingsHref(entry.id) === pathname,
    );
    return section ? `Настройки / ${section.title}` : "Настройки";
  }
  return (
    titles[pathname] ??
    (collection?.displayName || collection?.name || "Коллекции")
  );
}
