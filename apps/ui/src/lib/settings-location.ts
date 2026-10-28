export const settingsTabs = [
  "profile",
  "security",
  "appearance",
  "applications",
] as const;
export type SettingsTab = (typeof settingsTabs)[number];

export function settingsTab(value: unknown): SettingsTab {
  return settingsTabs.find((tab) => tab === value) ?? "profile";
}

export function settingsTabHref(href: string, tab: SettingsTab): string {
  const url = new URL(href, "http://navigation.invalid");
  url.searchParams.set("tab", tab);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function settingsReturnHref(
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  if (settingsTabs.some((tab) => tab === query.tab)) {
    params.set("tab", query.tab as string);
  }
  for (const key of ["workspace", "sso", "connection"]) {
    const value = query[key];
    if (typeof value === "string" && value.length <= 128) {
      params.set(key, value);
    }
  }
  return `/settings${params.size ? `?${params}` : ""}`;
}
