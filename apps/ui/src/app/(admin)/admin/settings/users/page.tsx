import { AccessWorkspace } from "@/components/access/access-workspace";
import type { PolicyCollection } from "@/components/access/types";
import { loadAccessData } from "@/lib/access-data";
import { requireSettingsSection } from "@/lib/settings-access";

export default async function SettingsPage() {
  const {
    token,
    readOnly,
    user,
    access: settingsAccess,
  } = await requireSettingsSection("users");
  const collections: PolicyCollection[] = [];
  const access = await loadAccessData(token, "users");
  return (
    <AccessWorkspace
      canManagePolicies={settingsAccess.canManagePolicies}
      delegatablePolicyIds={settingsAccess.delegatablePolicyIds}
      currentUserId={user.id}
      readOnly={readOnly}
      section="users"
      collections={collections}
      initialData={access.data}
      initialError={access.error}
    />
  );
}
