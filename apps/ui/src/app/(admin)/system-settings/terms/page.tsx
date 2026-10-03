import { TermsWorkspace } from "@/components/terms/terms-workspace";
import type { TermDefinition } from "@asmblyr/contracts";
import {
  requireSettingsSection,
  readSettingsResource,
} from "@/lib/settings-access";

export default async function SettingsPage() {
  const { token, readOnly } = await requireSettingsSection("terms");
  const value = await readSettingsResource<TermDefinition[]>(
    token,
    "/settings/terms",
  );
  return (
    <TermsWorkspace
      readOnly={readOnly}
      initial={value}
    />
  );
}
