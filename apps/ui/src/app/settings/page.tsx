import { loadSettingsAccess } from "@/lib/settings-access";
import { cookies } from "next/headers";
import Link from "next/link";
import { AdminShell } from "@/components/layout/admin-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { AccountTheme } from "@/components/settings/account-theme";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { loadCollections } from "@/lib/collections";
import { requireSession } from "@/lib/session";
import { loadWorkspaces } from "@/lib/workspaces";
import { loadLoginProviders } from "@/lib/sso-server";
import { loadPluginExtensions } from "@/lib/plugin-extensions";
import { getUiCopy } from "@/lib/ui-copy-server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sso?: string; connection?: string }>;
}) {
  const copy = await getUiCopy();

  const query = await searchParams;
  const returnQuery = new URLSearchParams();
  if (query.tab === "security" || query.tab === "applications") {
    returnQuery.set("tab", query.tab);
  }
  if (typeof query.sso === "string" && query.sso.length <= 64) {
    returnQuery.set("sso", query.sso);
  }
  const returnPath = returnQuery.size
    ? `/settings?${returnQuery}`
    : "/settings";
  const { user, token } = await requireSession(returnPath);
  const settings = await loadSettingsAccess(token);
  const providers = await loadLoginProviders();
  const ssoProps = {
    providers,
    initialTab: query.tab,
    ssoStatus: query.sso,
    connectionStatus: query.connection,
  };
  const { data, folders } = await loadCollections(token);
  const collections = data.filter(
    (collection) =>
      collection.access.read ||
      collection.access.create ||
      collection.access.update,
  );
  if (
    !user.superuser &&
    collections.length === 0 &&
    settings.sections.length === 0
  ) {
    return (
      <main className="min-h-dvh px-4 py-6 sm:px-8">
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
  const jar = await cookies();
  const workspaces = await loadWorkspaces(token);
  const plugins = await loadPluginExtensions(token).catch(() => []);
  return (
    <AdminShell
      settingsSections={settings.sections}
      user={user}
      collections={collections.map(
        ({ name, displayName, translations, folderId, access }) => ({
          name,
          displayName,
          translations,
          folderId,
          readable: Boolean(access.read),
        }),
      )}
      folders={folders}
      workspaces={workspaces}
      plugins={plugins}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      <SettingsWorkspace
        user={user}
        {...ssoProps}
      />
    </AdminShell>
  );
}
