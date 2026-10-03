import { AccessWorkspace } from "@/components/access/access-workspace";
import type { PolicyCollection } from "@/components/access/types";
import { loadAccessData } from "@/lib/access-data";
import {
  requireSettingsSection,
  readSettingsResource,
} from "@/lib/settings-access";

export default async function SettingsPage() {
  const {
    token,
    readOnly,
    user,
    access: settingsAccess,
  } = await requireSettingsSection("policies");
  const collections: PolicyCollection[] = await readSettingsResource<
    PolicyCollection[]
  >(token, "/settings/options/collections");
  const access = await loadAccessData(token, "policies");
  return (
    <AccessWorkspace
      canManagePolicies={settingsAccess.canManagePolicies}
      delegatablePolicyIds={settingsAccess.delegatablePolicyIds}
      currentUserId={user.id}
      readOnly={readOnly}
      section="policies"
      collections={collections}
      initialData={access.data}
      initialError={access.error}
    />
  );
}
