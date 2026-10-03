"use client";

import { SettingsReadOnlyNotice } from "@/components/system-settings/read-only-notice";

import { useCallback, useState } from "react";
import type { PolicyCollection } from "./types";
import type { AccessData } from "@/lib/access-data";
import { PageHeader } from "@/components/layout/page-header";
import { PoliciesPanel } from "./policies-panel";
import { UsersPanel } from "./users-panel";
import { accessRequest } from "@/lib/access-request";
import { type AccessUser, type Permission, type Policy } from "./types";

export function AccessWorkspace({
  readOnly = false,
  canManagePolicies = false,
  delegatablePolicyIds = [],
  currentUserId,
  collections,
  section,
  initialData,
  initialError,
}: {
  readOnly?: boolean;
  canManagePolicies?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  collections: PolicyCollection[];
  section: "users" | "policies";
  initialData: AccessData;
  initialError: string;
}) {
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
        title={section === "users" ? "Пользователи" : "Политики доступа"}
        description={
          section === "users"
            ? "Приглашения и доступ участников команды."
            : "Разрешения на данные и разделы настроек."
        }
      />
      <SettingsReadOnlyNotice readOnly={readOnly} />
      {message && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {message}
        </p>
      )}
      {section === "users" && (
        <UsersPanel
          canManageDelegation={canManagePolicies}
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
