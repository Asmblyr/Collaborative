import type { SettingsSection } from "@asmblyr-collaborative/contracts";
import { loadSettingsAccess } from "@/lib/settings-access";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/layout/admin-shell";
import { loadCollections } from "@/lib/collections";
import { collectionNavigationEntries } from "@/lib/collection-navigation";
import { requestSessionToken, loadSessionUser } from "@/lib/session";
import { loadWorkspaces } from "@/lib/workspaces";
import { loadPluginExtensions } from "@/lib/plugin-extensions";
import { BrowserMonitoring } from "@/components/monitoring/browser-monitoring";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = await requestSessionToken();

  const userPromise = token ? loadSessionUser(token) : Promise.resolve(null);
  const catalogPromise = token
    ? loadCollections(token)
    : Promise.resolve({ data: [], folders: [], online: false });
  const workspacesPromise = token
    ? loadWorkspaces(token)
    : Promise.resolve({ workspaces: [], selectedId: null });
  const settingsPromise = token
    ? loadSettingsAccess(token).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      )
    : Promise.resolve({
        ok: true as const,
        value: { sections: [] as SettingsSection[] },
      });
  const pluginsPromise = token
    ? loadPluginExtensions(token).catch(() => [])
    : Promise.resolve([] as string[]);

  const [user, catalog, rawWorkspaces, settingsResult, rawPlugins] =
    await Promise.all([
      userPromise,
      catalogPromise,
      workspacesPromise,
      settingsPromise,
      pluginsPromise,
    ]);

  let settings = { sections: [] as SettingsSection[] };
  if (user) {
    if (!settingsResult.ok) {
      throw settingsResult.error;
    }
    settings = settingsResult.value;
  }
  const workspaces = user
    ? rawWorkspaces
    : { workspaces: [], selectedId: null };
  const plugins = user ? rawPlugins : [];

  const { data: collections, folders, online } = catalog;
  const usableCollections = collectionNavigationEntries(collections);
  const noAccess = Boolean(
    online &&
      user &&
      !user.superuser &&
      usableCollections.length === 0 &&
      settings.sections.length === 0,
  );

  return (
    <AdminShell
      settingsSections={settings.sections}
      collections={usableCollections}
      folders={folders}
      user={user}
      noAccess={noAccess}
      workspaces={workspaces}
      plugins={plugins}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {user && <BrowserMonitoring key={user.id} />}
      {children}
    </AdminShell>
  );
}
