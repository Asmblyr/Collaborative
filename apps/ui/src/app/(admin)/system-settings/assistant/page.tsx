import { SystemSettingsWorkspace } from "@/components/system-settings/system-settings-workspace";
import type { AssistantSystemSettings } from "@/components/system-settings/types";
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
