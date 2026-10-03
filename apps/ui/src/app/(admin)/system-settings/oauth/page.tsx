import { requireSettingsSection } from "@/lib/settings-access";
import { ApplicationsWorkspace } from "@/components/oauth/applications-workspace";
import { coreAddress } from "@/lib/session";

export default async function OAuthApplicationsPage() {
  const { token, readOnly } = await requireSettingsSection("oauth");
  async function read(path: string) {
    const response = await fetch(coreAddress(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error("Не удалось загрузить OAuth-приложения");
    }
    return (await response.json()).data;
  }
  const status = await read("/oauth-apps/status");
  if (!status.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        OAuth-провайдер пока не настроен. Укажите OAUTH_ISSUER_URL и
        OAUTH_KEYS_FILE в Core.
      </p>
    );
  }
  const [applications, users] = await Promise.all([
    read("/oauth-apps"),
    read("/settings/options/users"),
  ]);
  return (
    <ApplicationsWorkspace
      readOnly={readOnly}
      applications={applications}
      users={users}
      issuer={status.issuer}
    />
  );
}
