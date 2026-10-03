import { loadSettingsAccess } from "@/lib/settings-access";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/layout/admin-shell";
import { NoAccessLayout } from "@/components/layout/no-access-layout";
import { loadCollections } from "@/lib/collections";
import { ACCESS_COOKIE, loadSessionUser } from "@/lib/session";
import { loadWorkspaces } from "@/lib/workspaces";
import { loadPluginExtensions } from "@/lib/plugin-extensions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  const user = token ? await loadSessionUser(token) : null;
  const {
    data: collections,
    folders,
    online,
  } = token
    ? await loadCollections(token)
    : { data: [], folders: [], online: false };
  const usableCollections = collections.filter(
    (collection) =>
      collection.access.read ||
      collection.access.create ||
      collection.access.update,
  );
  const workspaces =
    token && user
      ? await loadWorkspaces(token)
      : { workspaces: [], selectedId: null };
  const settings =
    token && user ? await loadSettingsAccess(token) : { sections: [] };
  const plugins =
    token && user ? await loadPluginExtensions(token).catch(() => []) : [];

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
          hidden,
          folderId,
          parentCollection,
          access,
        }) => ({
          name,
          displayName,
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
      {children}
    </AdminShell>
  );
}
