"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { showToast } from "@/components/ui/toast";
import { accessRequest } from "@/lib/access-request";
import { useUiCopy } from "@/lib/ui-copy";
import { AccessConfirmDialog } from "./access-confirm-dialog";
import { accessText, localizeAccessError } from "./access-helpers";
import {
  PolicyApplications,
  usePolicyApplications,
} from "./policy-applications";
import { conditionIsValid, permissionFields } from "./policy-condition-model";
import { policyDraft } from "./policy-draft";
import { PolicyPermissionsMatrix } from "./policy-permissions-matrix";
import { policySettingsDraft } from "./policy-settings-draft";
import { PolicySettingsPermissions } from "./policy-settings-permissions";
import { PolicyUsersPicker } from "./policy-users-picker";
import type { AccessUser, Permission, Policy, PolicyCollection } from "./types";

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
  const formId = useId();
  const closeRef = useRef<() => void>(() => onClose());
  const applications = usePolicyApplications(open, policy?.id);

  const [name, setName] = useState(policy?.name ?? "");
  const [grants, setGrants] = useState(() =>
    policyDraft(policy?.id, permissions),
  );
  const [sections, setSections] = useState(() =>
    policySettingsDraft(policy?.id, permissions),
  );
  const assignedUsersCount = policy
    ? users.filter((user) => user.policyIds.includes(policy.id)).length
    : 0;
  const [userIds, setUserIds] = useState(() =>
    users
      .filter((user) => policy && user.policyIds.includes(policy.id))
      .map((user) => user.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [initialDraft] = useState(() =>
    JSON.stringify({ name, grants, sections, userIds }),
  );

  function findInvalidGrantCollection(): string | null {
    for (const grant of grants) {
      if (!grant.rowFilter) {
        continue;
      }
      const collection = collections.find(
        (entry) => entry.name === grant.collection,
      );
      if (!collection) {
        continue;
      }
      const fields = permissionFields(collection, copy);
      if (!conditionIsValid(grant.rowFilter, fields)) {
        return collection.displayName || collection.name;
      }
    }
    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>, close: () => void) {
    event.preventDefault();
    if (
      busy ||
      readOnly ||
      (!assignmentOnly && (applications.loading || applications.error))
    ) {
      return;
    }

    if (!assignmentOnly) {
      const invalidCollection = findInvalidGrantCollection();
      if (invalidCollection) {
        setError(
          accessText(
            copy.locale,
            `В правиле «По условию» для коллекции «${invalidCollection}» не заполнены обязательные значения.`,
            `A conditional rule for collection "${invalidCollection}" has incomplete required values.`,
          ),
        );
        return;
      }
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
              applications: applications.selected,
            },
      );
      await onChange();
      showToast(copy("Настройки сохранены"), "success");
      close();
    } catch (cause) {
      setError(localizeAccessError((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (readOnly || assignmentOnly || !policy || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accessRequest(`/policies/${policy.id}`, "DELETE");
      setConfirmDeleteOpen(false);
      await onChange();
      showToast(copy("Политика удалена"), "success");
      closeRef.current();
    } catch (cause) {
      setConfirmDeleteOpen(false);
      setError(localizeAccessError((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function assign(userId: string, checked: boolean) {
    setUserIds((current) =>
      checked
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId),
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
  const permissionFieldsView = (
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

  const deleteDescription =
    assignedUsersCount > 0
      ? accessText(
          copy.locale,
          `Сейчас эта политика назначена пользователям: ${assignedUsersCount}. После удаления все её назначения будут сняты, а права перестанут действовать.`,
          `This policy is currently assigned to ${assignedUsersCount} user(s). Deleting it will revoke all assignments and permissions.`,
        )
      : accessText(
          copy.locale,
          "Сейчас эта политика никому не назначена. Удалить политику безвозвратно?",
          "This policy is not assigned to anyone. Delete it permanently?",
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
        JSON.stringify({ name, grants, sections, userIds }) !== initialDraft ||
        applications.dirty
      }
      onClose={onClose}
      footer={(requestClose, close) => {
        closeRef.current = close;
        return (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {policy && !readOnly && !assignmentOnly ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {copy("Удалить политику")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={requestClose}
              >
                {readOnly ? copy("Закрыть") : copy("Отмена")}
              </Button>
              {!readOnly && (
                <Button
                  type="submit"
                  form={formId}
                  disabled={
                    busy ||
                    !name.trim() ||
                    (!assignmentOnly &&
                      (applications.loading || Boolean(applications.error)))
                  }
                >
                  {busy ? copy("Сохранение…") : copy("Сохранить")}
                </Button>
              )}
            </div>
          </div>
        );
      }}
    >
      {(container, close) => (
        <PortalContainerContext.Provider value={container}>
          <form
            id={formId}
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
            {applications.error && (
              <div
                role="alert"
                className="flex items-center gap-3 text-sm text-destructive"
              >
                <span>{copy("Не удалось загрузить приложения")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applications.retry}
                >
                  {copy("Повторить")}
                </Button>
              </div>
            )}
            {assignmentOnly && readOnly && (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {accessText(
                  copy.locale,
                  "Вне вашего набора делегирования — доступен только просмотр прав и назначений.",
                  "Outside your delegation set — view-only access to permissions and assignments.",
                )}
              </p>
            )}
            {assignmentOnly && !readOnly && (
              <p className="text-xs text-muted-foreground">
                {copy(
                  "Можно назначать готовую политику другим пользователям. Состав прав меняет администратор.",
                )}
              </p>
            )}
            {!assignmentOnly && (
              <div className="space-y-3">
                <Label htmlFor="policy-editor-name">
                  {copy("Название политики")}{" "}
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
                  {permissionFieldsView}
                  <PolicyApplications
                    state={applications}
                    disabled
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <Tabs
                defaultValue="permissions"
                className="space-y-5"
              >
                <TabsList>
                  <TabsTrigger value="permissions">
                    {copy("Права политики")}
                  </TabsTrigger>
                  <TabsTrigger value="applications">
                    {copy("Приложения")}
                  </TabsTrigger>
                  <TabsTrigger value="users">
                    {copy("Пользователи")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="permissions"
                  className="space-y-6"
                >
                  {permissionFieldsView}
                </TabsContent>
                <TabsContent value="applications">
                  <PolicyApplications
                    state={applications}
                    disabled={busy || readOnly}
                  />
                </TabsContent>
                <TabsContent value="users">{usersPicker}</TabsContent>
              </Tabs>
            )}
          </form>
          {policy && (
            <AccessConfirmDialog
              open={confirmDeleteOpen}
              title={accessText(
                copy.locale,
                `Удалить политику «${policy.name}»?`,
                `Delete policy "${policy.name}"?`,
              )}
              description={deleteDescription}
              confirmLabel={
                busy
                  ? accessText(copy.locale, "Удаление…", "Deleting…")
                  : copy("Удалить политику")
              }
              destructive
              busy={busy}
              onConfirm={confirmRemove}
              onCancel={() => setConfirmDeleteOpen(false)}
            />
          )}
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
