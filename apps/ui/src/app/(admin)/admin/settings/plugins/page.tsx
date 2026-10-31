import { PluginsWorkspace } from "@/components/admin/settings/plugins/plugins-workspace";
import type { PluginSettingsEntry } from "@/components/admin/settings/plugins/types";
import type { ExtensionEntry } from "@asmblyr-collaborative/contracts";
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
  const registry: ExtensionEntry[] = [];
  let page = 1;
  while (true) {
    const chunk = await readSettingsResource<ExtensionEntry[]>(
      token,
      `/settings/extension-registry?limit=100&page=${page}`,
    );
    registry.push(...chunk);
    if (chunk.length < 100) {
      break;
    }
    page += 1;
  }
  return (
    <PluginsWorkspace
      readOnly={readOnly}
      plugins={value}
      registry={registry}
    />
  );
}
