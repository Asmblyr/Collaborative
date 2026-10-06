"use client";

import { policySettingsDraft } from "./policy-settings-draft";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { PolicySettingsPermissions } from "./policy-settings-permissions";
import { useState, type FormEvent } from "react";
import type { PolicyCollection } from "./types";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { PolicyUsersPicker } from "./policy-users-picker";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { policyDraft } from "./policy-draft";
import { PolicyPermissionsMatrix } from "./policy-permissions-matrix";
import { accessRequest } from "@/lib/access-request";
import { type AccessUser, type Permission, type Policy } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function PolicyEditorDialog({
  open,
  readOnly = false,
  assignmentOnly = false,
  currentUserId,
  policy,
  collections,
  permissions,
  users,
  onClose,
  onChange,
}: {
  open: boolean;
  readOnly?: boolean;
  assignmentOnly?: boolean;
  currentUserId?: string;
  policy?: Policy;
  collections: PolicyCollection[];
  permissions: Permission[];
  users: AccessUser[];
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const copy = useUiCopy();

  const [name, setName] = useState(policy?.name ?? "");
  const [grants, setGrants] = useState(() =>
    policyDraft(policy?.id, permissions),
  );
  const [sections, setSections] = useState(() =>
    policySettingsDraft(policy?.id, permissions),
  );
  const [userIds, setUserIds] = useState(() =>
    users
      .filter((user) => policy && user.policyIds.includes(policy.id))
      .map((user) => user.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialDraft] = useState(() =>
    JSON.stringify({ name, grants, sections, userIds }),
  );

  async function save(event: FormEvent<HTMLFormElement>, close: () => void) {
    event.preventDefault();
    if (busy || readOnly) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accessRequest(
        assignmentOnly && policy
          ? `/policies/${policy.id}/users`
          : policy
            ? `/policies/${policy.id}`
            : "/policies",
        assignmentOnly ? "PUT" : policy ? "PATCH" : "POST",
        assignmentOnly
          ? { userIds }
          : {
              name: name.trim(),
              permissions: [...grants, ...sections],
              userIds,
            },
      );
      await onChange();
      close();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(close: () => void) {
    if (
      readOnly ||
      assignmentOnly ||
      !policy ||
      !window.confirm(
        copy("Удалить политику «{{value0}}» и её назначения?", {
          value0: policy.name,
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accessRequest(`/policies/${policy.id}`, "DELETE");
      await onChange();
      close();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function assign(userId: string, checked: boolean) {
    setUserIds((current) =>
      checked ? [...current, userId] : current.filter((id) => id !== userId),
    );
  }

  const usersPicker = (
    <PolicyUsersPicker
      users={users}
      selected={userIds}
      disabled={busy || readOnly}
      protectedUserId={assignmentOnly ? currentUserId : undefined}
      onChange={assign}
    />
  );
  const permissionFields = (
    <>
      <PolicySettingsPermissions
        selected={sections}
        onChange={setSections}
        disabled={busy || readOnly || assignmentOnly}
      />
      <PolicyPermissionsMatrix
        policyName={name}
        collections={collections}
        readOnly={readOnly || assignmentOnly}
        grants={grants}
        onChange={setGrants}
      />
    </>
  );

  return (
    <EditorDialog
      open={open}
      size={assignmentOnly ? "default" : "wide"}
      title={
        policy
          ? copy("Политика: {{value0}}", { value0: policy.name })
          : copy("Новая политика")
      }
      eyebrow={
        readOnly
          ? copy("Доступ · просмотр")
          : assignmentOnly
            ? copy("Доступ · назначения")
            : copy("Доступ")
      }
      busy={busy}
      hasUnsavedChanges={
        JSON.stringify({ name, grants, sections, userIds }) !== initialDraft
      }
      onClose={onClose}
    >
      {(container, close) => (
        <PortalContainerContext.Provider value={container}>
          <form
            onSubmit={(event) => save(event, close)}
            className="space-y-8 pb-4"
          >
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {copy(error)}
              </p>
            )}
            {assignmentOnly && !readOnly && (
              <p className="text-xs text-muted-foreground">
                {copy(
                  "Можно назначать готовую политику другим пользователям. Состав прав меняет администратор. ",
                )}
              </p>
            )}
            {!assignmentOnly && (
              <div className="space-y-3">
                <Label htmlFor="policy-editor-name">
                  {copy("Название политики ")}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="policy-editor-name"
                  value={name}
                  maxLength={120}
                  required
                  disabled={busy || readOnly || assignmentOnly}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}
            {assignmentOnly ? (
              <Tabs
                defaultValue={readOnly ? "permissions" : "users"}
                className="space-y-5"
              >
                <TabsList>
                  <TabsTrigger value="users">
                    {copy("Пользователи")}
                  </TabsTrigger>
                  <TabsTrigger value="permissions">
                    {copy("Права политики")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="users"
                  forceMount
                  className="data-[state=inactive]:hidden"
                >
                  {usersPicker}
                </TabsContent>
                <TabsContent
                  value="permissions"
                  forceMount
                  className="space-y-6 data-[state=inactive]:hidden"
                >
                  {permissionFields}
                </TabsContent>
              </Tabs>
            ) : (
              <>
                {permissionFields}
                {usersPicker}
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              {policy && !readOnly && !assignmentOnly ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(close)}
                >
                  {copy("Удалить политику ")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={close}
                >
                  {readOnly ? copy("Закрыть") : copy("Отмена")}
                </Button>
                {!readOnly && (
                  <Button
                    type="submit"
                    disabled={busy || !name.trim()}
                  >
                    {busy ? copy("Сохранение…") : copy("Сохранить")}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
