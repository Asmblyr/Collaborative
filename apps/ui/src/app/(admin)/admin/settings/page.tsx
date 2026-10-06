import { requireSession } from "@/lib/session";
import { loadSettingsAccess } from "@/lib/settings-access";
import { SettingsOverview } from "@/components/admin/settings/settings-overview";

export default async function SettingsPage() {
  const { token, user } = await requireSession("/admin/settings");
  const { sections } = await loadSettingsAccess(token);
  return (
    <SettingsOverview
      sections={sections}
      superuser={user.superuser}
    />
  );
}
