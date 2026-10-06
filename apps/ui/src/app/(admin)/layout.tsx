import { loadSettingsAccess } from "@/lib/settings-access";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/layout/admin-shell";
import { NoAccessLayout } from "@/components/layout/no-access-layout";
import { loadCollections } from "@/lib/collections";
import { SESSION_COOKIE, loadSessionUser } from "@/lib/session";
import { loadWorkspaces } from "@/lib/workspaces";
import { loadPluginExtensions } from "@/lib/plugin-extensions";
import { BrowserMonitoring } from "@/components/monitoring/browser-monitoring";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const user = token ? await loadSessionUser(token) : null;
  const [catalog, workspaces, settings, plugins] = await Promise.all([
    token ? loadCollections(token) : { data: [], folders: [], online: false },
    token && user
      ? loadWorkspaces(token)
      : { workspaces: [], selectedId: null },
    token && user ? loadSettingsAccess(token) : { sections: [] },
    token && user ? loadPluginExtensions(token).catch(() => []) : [],
  ]);
  const { data: collections, folders, online } = catalog;
  const usableCollections = collections.filter(
    (collection) =>
      collection.access.read ||
      collection.access.create ||
      collection.access.update,
  );
  if (
    online &&
    user &&
    !user.superuser &&
    usableCollections.length === 0 &&
    settings.sections.length === 0
  ) {
    return <NoAccessLayout />;
  }

  return (
    <AdminShell
      settingsSections={settings.sections}
      collections={usableCollections.map(
        ({
          name,
          displayName,
          translations,
          hidden,
          folderId,
          parentCollection,
          access,
        }) => ({
          name,
          displayName,
          translations,
          hidden,
          folderId,
          parentCollection,
          readable: Boolean(access.read),
        }),
      )}
      folders={folders}
      user={user}
      workspaces={workspaces}
      plugins={plugins}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {user && <BrowserMonitoring key={user.id} />}
      {children}
    </AdminShell>
  );
}
