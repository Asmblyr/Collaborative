import { requireSession } from "@/lib/session";
import { loadSettingsAccess } from "@/lib/settings-access";
import { SettingsOverview } from "@/components/system-settings/settings-overview";

export default async function SettingsPage() {
  const { token } = await requireSession("/system-settings");
  const { sections } = await loadSettingsAccess(token);
  return <SettingsOverview sections={sections} />;
}
