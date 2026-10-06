import { SystemSettingsWorkspace } from "@/components/admin/settings/system-settings-workspace";
import type { AssistantSystemSettings } from "@/components/admin/settings/types";
import {
  requireSettingsSection,
  readSettingsResource,
} from "@/lib/settings-access";

export default async function AssistantSettingsPage() {
  const { token, readOnly } = await requireSettingsSection("assistant");
  const initial = await readSettingsResource<AssistantSystemSettings>(
    token,
    "/settings/assistant",
  );
  return (
    <SystemSettingsWorkspace
      readOnly={readOnly}
      initial={initial}
    />
  );
}
