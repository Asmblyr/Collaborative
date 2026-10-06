import {
  settingsCatalog,
  integrationSettingsEntry,
  settingsHref,
} from "@/components/admin/settings/sections";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

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
  t: (key: string, fallback?: string) => string = (_key, fallback) =>
    fallback ?? "",
  copy: UiCopy = originalCopy,
): string {
  if (pathname === "/") {
    return t("nav.home", "Главная");
  }
  if (pathname === "/admin/collections") {
    return t("nav.collections", "Коллекции");
  }
  if (pathname.startsWith("/admin/settings")) {
    const section = [...settingsCatalog, integrationSettingsEntry].find(
      (entry) => settingsHref(entry.id) === pathname,
    );
    return section
      ? `${t("admin.title", "Настройки")} / ${t(`admin.${section.id}`, copy(section.title))}`
      : t("admin.title", "Настройки");
  }
  return (
    (titles[pathname]
      ? t(
          (
            {
              "/files": "nav.files",
              "/settings": "nav.account",
              "/search": "nav.search",
            } as Record<string, string>
          )[pathname] ?? pathname,
          copy(titles[pathname]),
        )
      : undefined) ??
    (collection?.displayName ||
      collection?.name ||
      t("nav.collections", "Коллекции"))
  );
}
