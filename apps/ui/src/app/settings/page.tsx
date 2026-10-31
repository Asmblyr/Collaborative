import { loadSettingsAccess } from "@/lib/settings-access";
import { cookies } from "next/headers";
import Link from "next/link";
import { AdminShell } from "@/components/layout/admin-shell";
import { BrowserMonitoring } from "@/components/monitoring/browser-monitoring";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { AccountTheme } from "@/components/settings/account-theme";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { loadCollections } from "@/lib/collections";
import { collectionNavigationEntries } from "@/lib/collection-navigation";
import { requireSession } from "@/lib/session";
import { loadWorkspaces } from "@/lib/workspaces";
import { loadLoginProviders } from "@/lib/sso-server";
import { loadPluginExtensions } from "@/lib/plugin-extensions";
import { getUiCopy } from "@/lib/ui-copy-server";
import { settingsReturnHref } from "@/lib/settings-location";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const copy = await getUiCopy();

  const query = await searchParams;
  const { user, token } = await requireSession(settingsReturnHref(query));
  const [settings, providers, catalog, jar] = await Promise.all([
    loadSettingsAccess(token),
    loadLoginProviders(),
    loadCollections(token),
    cookies(),
  ]);
  const ssoProps = {
    providers,
    ssoStatus: typeof query.sso === "string" ? query.sso : undefined,
    connectionStatus:
      typeof query.connection === "string" ? query.connection : undefined,
  };
  const { data, folders } = catalog;
  const collections = collectionNavigationEntries(data);
  if (
    !user.superuser &&
    collections.length === 0 &&
    settings.sections.length === 0
  ) {
    return (
      <main className="min-h-dvh px-4 py-6 sm:px-8">
        <BrowserMonitoring key={user.id} />
        <div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
          <Button
            asChild
            variant="ghost"
          >
            <Link href="/">{copy("← На главную")}</Link>
          </Button>
          <LogoutButton />
        </div>
        <AccountTheme key={user.id}>
          <SettingsWorkspace
            user={user}
            {...ssoProps}
          />
        </AccountTheme>
      </main>
    );
  }
  const [workspaces, plugins] = await Promise.all([
    loadWorkspaces(token),
    loadPluginExtensions(token).catch(() => []),
  ]);
  return (
    <AdminShell
      settingsSections={settings.sections}
      user={user}
      collections={collections}
      folders={folders}
      workspaces={workspaces}
      plugins={plugins}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      <BrowserMonitoring key={user.id} />
      <SettingsWorkspace
        user={user}
        {...ssoProps}
      />
    </AdminShell>
  );
}
