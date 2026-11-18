import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { requireSession } from "@/lib/session";
import { loadLoginProviders } from "@/lib/sso-server";
import { settingsReturnHref } from "@/lib/settings-location";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const [{ user }, providers] = await Promise.all([
    requireSession(settingsReturnHref(query)),
    loadLoginProviders(),
  ]);

  return (
    <SettingsWorkspace
      user={user}
      providers={providers}
      ssoStatus={typeof query.sso === "string" ? query.sso : undefined}
      connectionStatus={
        typeof query.connection === "string" ? query.connection : undefined
      }
    />
  );
}
