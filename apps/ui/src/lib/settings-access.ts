import { cache } from "react";
import { redirect } from "next/navigation";
import type { SettingsAccess, SettingsSection } from "@asmblyr/contracts";
import { coreAddress, requireSession } from "./session";

export const loadSettingsAccess = cache(
  async (token: string): Promise<SettingsAccess> => {
    const response = await fetch(coreAddress("/settings/access"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error("Не удалось проверить доступ к настройкам");
    }
    return (await response.json()).data;
  },
);

export async function requireSettingsSection(section: SettingsSection) {
  const session = await requireSession(`/system-settings/${section}`);
  const access = await loadSettingsAccess(session.token);
  if (!access.sections.includes(section)) {
    redirect(access.sections.length ? "/system-settings" : "/");
  }
  return {
    ...session,
    access,
    readOnly: !(access.editableSections ?? []).includes(section),
  };
}

export async function readSettingsResource<T>(
  token: string,
  path: string,
): Promise<T> {
  const response = await fetch(coreAddress(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки. Обновите страницу.");
  }
  return (await response.json()).data;
}
