import { cache } from "react";
import { redirect } from "next/navigation";
import type {
  SettingsAccess,
  SettingsSection,
} from "@asmblyr-collaborative/contracts";
import { requireSession } from "./session";
import { readCoreResource } from "./core-resource";

export const loadSettingsAccess = cache(
  async (token: string): Promise<SettingsAccess> => {
    return readCoreResource<SettingsAccess>(token, "/settings/access");
  },
);

export async function requireSettingsSection(section: SettingsSection) {
  const session = await requireSession(`/admin/settings/${section}`);
  const access = await loadSettingsAccess(session.token);
  if (!access.sections.includes(section)) {
    redirect(access.sections.length ? "/admin/settings" : "/");
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
  return readCoreResource<T>(token, path);
}
