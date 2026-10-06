import { PluginsWorkspace } from "@/components/admin/settings/plugins/plugins-workspace";
import type { PluginSettingsEntry } from "@/components/admin/settings/plugins/types";
import {
  requireSettingsSection,
  readSettingsResource,
} from "@/lib/settings-access";

export default async function SettingsPage() {
  const { token, readOnly } = await requireSettingsSection("plugins");
  const value = await readSettingsResource<PluginSettingsEntry[]>(
    token,
    "/settings/plugins",
  );
  return (
    <PluginsWorkspace
      readOnly={readOnly}
      plugins={value}
    />
  );
}
