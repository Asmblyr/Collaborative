"use client";

import { SettingsReadOnlyNotice } from "@/components/admin/settings/read-only-notice";

import { useCallback, useState } from "react";
import type { PolicyCollection } from "./types";
import type { AccessData } from "@/lib/access-data";
import { PageHeader } from "@/components/layout/page-header";
import { PoliciesPanel } from "./policies-panel";
import { UsersPanel } from "./users-panel";
import { ProfileExtensionSettings } from "./profile-extension-settings";
import { ProfileDisplaySettings } from "./profile-display-settings";
import { accessRequest } from "@/lib/access-request";
import { type AccessUser, type Permission, type Policy } from "./types";
import { useUiCopy } from "@/lib/ui-copy";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";

export function AccessWorkspace({
  readOnly = false,
  canManagePolicies = false,
  canManageSystemFields = false,
  delegatablePolicyIds = [],
  currentUserId,
  collections: rawCollections,
  section,
  initialData,
  initialError,
}: {
  readOnly?: boolean;
  canManagePolicies?: boolean;
  canManageSystemFields?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  collections: PolicyCollection[];
  section: "users" | "policies";
  initialData: AccessData;
  initialError: string;
}) {
  const copy = useUiCopy();
  const collections = useLocalizedCatalog(rawCollections);

  const [users, setUsers] = useState<AccessUser[]>(initialData.users);
  const [policies, setPolicies] = useState<Policy[]>(initialData.policies);
  const [permissions, setPermissions] = useState<Permission[]>(
    initialData.permissions,
  );
  const [message, setMessage] = useState(initialError);

  const reload = useCallback(async () => {
    const [userResult, policyResult, permissionResult] = await Promise.all([
      accessRequest<{ data: AccessUser[] }>("/users"),
      accessRequest<{ data: Policy[] }>(
        section === "users" ? "/settings/options/policies" : "/policies",
      ),
      section === "policies"
        ? accessRequest<{ data: Permission[] }>("/permissions")
        : Promise.resolve({ data: [] }),
    ]);
    setUsers(userResult.data);
    setPolicies(policyResult.data);
    setPermissions(permissionResult.data);
    setMessage("");
  }, [section]);

  async function refresh() {
    try {
      await reload();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title={
          section === "users" ? copy("Пользователи") : copy("Политики доступа")
        }
        description={
          section === "users"
            ? copy("Приглашения и доступ участников команды.")
            : copy("Разрешения на данные и разделы настроек.")
        }
      >
        {section === "users" && canManageSystemFields && !readOnly && (
          <ProfileDisplaySettings />
        )}
      </PageHeader>
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {section === "users" && canManagePolicies && !readOnly && (
        <ProfileExtensionSettings />
      )}
      {message && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
      {section === "users" && (
        <UsersPanel
          canManageDelegation={canManagePolicies}
          canManageSystemFields={canManageSystemFields}
          delegatablePolicyIds={delegatablePolicyIds}
          currentUserId={currentUserId}
          readOnly={readOnly}
          users={users}
          policies={policies}
          onChange={refresh}
          onError={setMessage}
        />
      )}
      {section === "policies" && (
        <PoliciesPanel
          canManagePolicies={canManagePolicies}
          delegatablePolicyIds={delegatablePolicyIds}
          currentUserId={currentUserId}
          readOnly={readOnly}
          policies={policies}
          permissions={permissions}
          collections={collections}
          users={users}
          onChange={refresh}
        />
      )}
    </div>
  );
}
