"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import type { SettingsAccess } from "@asmblyr-collaborative/contracts";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { availableSettings } from "@/components/admin/settings/sections";
import type { Collection } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { showToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { accessRequest } from "@/lib/access-request";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { AccessConfirmDialog } from "./access-confirm-dialog";
import {
  accessText,
  delegatingPolicyIdsFromPermissions,
  excludedPermissionFields,
  localizeAccessError,
  matchesAccessSearch,
  resolveCollectionFieldLabel,
} from "./access-helpers";
import { PolicyDelegationForm } from "./policy-delegation-form";
import {
  actionName,
  type EffectivePermission,
  type Permission,
  type Policy,
  type PolicyCollection,
  type UserAccess,
} from "./types";

function permissionGroups(permissions: EffectivePermission[]) {
  const groups = new Map<string, EffectivePermission[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.collection) ?? [];
    group.push(permission);
    groups.set(permission.collection, group);
  }
  return [...groups.entries()];
}

export function UserAccessDialog({
  userId,
  email,
  displayName,
  policies,
  canManageDelegation = false,
  delegatablePolicyIds = [],
  currentUserId,
  canToggleStatus = false,
  onDelegationSaved,
  onStatusChanged,
  onClose,
}: {
  userId: string;
  email: string;
  displayName?: string;
  policies: Policy[];
  canManageDelegation?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  canToggleStatus?: boolean;
  onDelegationSaved: () => Promise<void>;
  onStatusChanged?: () => Promise<void>;
  onClose: () => void;
}) {
  const copy = useUiCopy();

  const [access, setAccess] = useState<UserAccess | null>(null);
  const [viewerAccess, setViewerAccess] = useState<SettingsAccess | null>(null);
  const [rawCollections, setRawCollections] = useState<PolicyCollection[]>([]);
  const [delegatingPolicyIds, setDelegatingPolicyIds] = useState<string[]>([]);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [savedPolicyIds, setSavedPolicyIds] = useState<string[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [error, setError] = useState("");
  const [delegationDirty, setDelegationDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);

  const localizedCollections = useLocalizedCatalog(rawCollections);
  const collectionMap = new Map(
    localizedCollections.map((collection) => [collection.name, collection]),
  );

  useEffect(() => {
    let current = true;
    accessRequest<{ data: UserAccess }>(`/users/${userId}/access`)
      .then((result) => {
        if (current) {
          setAccess(result.data);
          const ids = result.data.policies.map((policy) => policy.id);
          setSelectedPolicyIds(ids);
          setSavedPolicyIds(ids);
        }
      })
      .catch((cause) => {
        if (current) {
          setError(localizeAccessError((cause as Error).message));
        }
      });

    if (!canManageDelegation) {
      accessRequest<{ data: SettingsAccess }>("/settings/access")
        .then((result) => {
          if (current) {
            setViewerAccess(result.data);
          }
        })
        .catch(() => {});
    }

    accessRequest<{ data: PolicyCollection[] }>("/settings/options/collections")
      .then((result) => {
        if (current) {
          setRawCollections(result.data);
        }
      })
      .catch(() =>
        apiRequest<Collection[]>("/api/collections")
          .then((result) => {
            if (current) {
              setRawCollections(result);
            }
          })
          .catch(() => {}),
      );

    if (canManageDelegation) {
      accessRequest<{ data: Permission[] }>("/permissions")
        .then((result) => {
          if (current) {
            setDelegatingPolicyIds(
              delegatingPolicyIdsFromPermissions(result.data),
            );
          }
        })
        .catch(() => {});
    }

    return () => {
      current = false;
    };
  }, [userId, canManageDelegation]);

  const effectiveDelegatableIds =
    viewerAccess?.delegatablePolicyIds ?? delegatablePolicyIds;
  const delegatableSet = useMemo(
    () => new Set(effectiveDelegatableIds),
    [effectiveDelegatableIds],
  );
  const isSelfTarget = Boolean(currentUserId && currentUserId === userId);
  const canEditPolicies = Boolean(
    access &&
      !access.user.superuser &&
      (canManageDelegation ||
        (!isSelfTarget &&
          viewerAccess?.editableSections.includes("policies") &&
          viewerAccess?.sections.includes("users") &&
          effectiveDelegatableIds.length > 0)),
  );
  const editablePolicies = useMemo(
    () =>
      canManageDelegation
        ? policies
        : policies.filter((policy) => delegatableSet.has(policy.id)),
    [canManageDelegation, policies, delegatableSet],
  );
  const lockedAssignedPolicies = useMemo(() => {
    if (!access || canManageDelegation) {
      return [];
    }
    return access.policies.filter((policy) => !delegatableSet.has(policy.id));
  }, [access, canManageDelegation, delegatableSet]);
  const visibleEditablePolicies = useMemo(
    () =>
      editablePolicies.filter((policy) =>
        matchesAccessSearch([policy.name], policySearch),
      ),
    [editablePolicies, policySearch],
  );
  const policiesDirty = useMemo(() => {
    const scopeFilter = (id: string) =>
      canManageDelegation || delegatableSet.has(id);
    const currentInScope = [...selectedPolicyIds].filter(scopeFilter).sort();
    const savedInScope = [...savedPolicyIds].filter(scopeFilter).sort();
    return JSON.stringify(currentInScope) !== JSON.stringify(savedInScope);
  }, [selectedPolicyIds, savedPolicyIds, canManageDelegation, delegatableSet]);
  const dirty = delegationDirty || policiesDirty;

  function toggleAssignedPolicy(policyId: string, checked: boolean) {
    setPolicyError("");
    setSelectedPolicyIds((current) =>
      checked
        ? current.includes(policyId)
          ? current
          : [...current, policyId]
        : current.filter((id) => id !== policyId),
    );
  }

  async function saveAssignedPolicies(event: FormEvent) {
    event.preventDefault();
    if (!canEditPolicies || savingPolicies || busy || !policiesDirty) {
      return;
    }
    setSavingPolicies(true);
    setBusy(true);
    setPolicyError("");
    try {
      const payloadIds = canManageDelegation
        ? selectedPolicyIds
        : [
            ...lockedAssignedPolicies.map((policy) => policy.id),
            ...selectedPolicyIds.filter((id) => delegatableSet.has(id)),
          ];
      await accessRequest<{ data: { policyIds: string[] } }>(
        `/users/${userId}/policies`,
        "PUT",
        { policyIds: [...new Set(payloadIds)] },
      );
      const refreshed = await accessRequest<{ data: UserAccess }>(
        `/users/${userId}/access`,
      );
      setAccess(refreshed.data);
      const nextIds = refreshed.data.policies.map((policy) => policy.id);
      setSelectedPolicyIds(nextIds);
      setSavedPolicyIds(nextIds);
      showToast(copy("Политики пользователя обновлены"), "success");
      await onDelegationSaved();
    } catch (cause) {
      setPolicyError(localizeAccessError((cause as Error).message));
    } finally {
      setSavingPolicies(false);
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!access || busy) {
      return;
    }
    const nextStatus =
      access.user.status === "disabled" ? "active" : "disabled";
    setBusy(true);
    setError("");
    try {
      await accessRequest(`/users/${userId}/status`, "PATCH", {
        status: nextStatus,
      });
      setAccess((current) =>
        current
          ? { ...current, user: { ...current.user, status: nextStatus } }
          : current,
      );
      setConfirmStatusOpen(false);
      showToast(
        nextStatus === "disabled"
          ? accessText(
              copy.locale,
              "Учётная запись отключена",
              "Account disabled",
            )
          : accessText(
              copy.locale,
              "Учётная запись включена",
              "Account enabled",
            ),
        "success",
      );
      await (onStatusChanged ?? onDelegationSaved)();
    } catch (cause) {
      setConfirmStatusOpen(false);
      setError(localizeAccessError((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const targetLabel =
    displayName && displayName !== email ? `${displayName} (${email})` : email;
  const isDisabled = access?.user.status === "disabled";

  return (
    <EditorDialog
      open
      title={copy("Доступ: {{value0}}", { value0: displayName || email })}
      eyebrow={
        displayName && displayName !== email
          ? `${copy("Пользователь")} · ${email}`
          : copy("Пользователь")
      }
      size="wide"
      busy={busy}
      hasUnsavedChanges={dirty}
      onClose={onClose}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canToggleStatus && access ? (
            <Button
              type="button"
              size="sm"
              variant={isDisabled ? "outline" : "destructive"}
              disabled={busy}
              onClick={() => setConfirmStatusOpen(true)}
            >
              {isDisabled
                ? accessText(
                    copy.locale,
                    "Включить учётную запись",
                    "Enable account",
                  )
                : accessText(
                    copy.locale,
                    "Отключить учётную запись",
                    "Disable account",
                  )}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={requestClose}
          >
            {copy("Закрыть")}
          </Button>
        </div>
      )}
    >
      {(container) => (
        <PortalContainerContext.Provider value={container}>
          <div className="space-y-7 pb-4">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {copy(error)}
              </p>
            )}
            {!access && !error && (
              <p
                role="status"
                className="text-sm text-muted-foreground"
              >
                {copy("Загружаем права…")}
              </p>
            )}
            {access && (
              <>
                {access.user.status === "disabled" && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {copy(
                      "Учётная запись отключена. Назначения сохранены, но сейчас войти и использовать права нельзя.",
                    )}
                  </p>
                )}
                {!access.user.hasPassword &&
                  !access.user.superuser &&
                  access.user.status === "active" && (
                    <p className="rounded-lg border p-3 text-sm">
                      {copy(
                        "Приглашение ещё не принято. Права начнут действовать после входа.",
                      )}
                    </p>
                  )}
                {access.user.superuser && (
                  <p className="rounded-lg border p-3 text-sm">
                    {access.user.status === "disabled"
                      ? copy(
                          "После включения учётной записи суперпользователь получит полный доступ к коллекциям и структуре.",
                        )
                      : copy(
                          "Суперпользователь имеет полный доступ к коллекциям и структуре без разрешений в политиках.",
                        )}
                  </p>
                )}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {copy("Назначенные политики")}
                    </h3>
                    {canEditPolicies && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {copy("Выбрано политик: {{value0}}", {
                          value0: selectedPolicyIds.length,
                        })}
                      </span>
                    )}
                  </div>
                  {canEditPolicies ? (
                    <form
                      onSubmit={saveAssignedPolicies}
                      className="space-y-3"
                    >
                      {lockedAssignedPolicies.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            {copy(
                              "Вне набора делегирования (сохранятся автоматически)",
                            )}
                          </p>
                          <TooltipProvider>
                            <div className="flex flex-wrap gap-2">
                              {lockedAssignedPolicies.map((policy) => (
                                <Tooltip key={policy.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      title={copy(
                                        "Вне вашего набора делегирования",
                                      )}
                                      className="inline-flex cursor-default items-center gap-1.5"
                                    >
                                      <Lock
                                        aria-hidden="true"
                                        className="size-3 text-muted-foreground"
                                      />
                                      {policy.name}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {copy("Вне вашего набора делегирования")}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        </div>
                      )}
                      {editablePolicies.length > 6 && (
                        <Input
                          aria-label={copy("Найти политику…")}
                          placeholder={copy("Найти политику…")}
                          value={policySearch}
                          onChange={(event) =>
                            setPolicySearch(event.target.value)
                          }
                        />
                      )}
                      <div className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                        {visibleEditablePolicies.map((policy) => (
                          <label
                            key={policy.id}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                          >
                            <Checkbox
                              checked={selectedPolicyIds.includes(policy.id)}
                              disabled={savingPolicies || busy}
                              onCheckedChange={(checked) =>
                                toggleAssignedPolicy(
                                  policy.id,
                                  checked === true,
                                )
                              }
                            />
                            <span className="min-w-0 break-words">
                              {policy.name}
                            </span>
                          </label>
                        ))}
                        {!visibleEditablePolicies.length && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            {policySearch
                              ? copy("Политики не найдены")
                              : copy("Нет доступных политик для назначения.")}
                          </p>
                        )}
                      </div>
                      {policyError && (
                        <p
                          role="alert"
                          className="text-sm text-destructive"
                        >
                          {copy(policyError)}
                        </p>
                      )}
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingPolicies || busy || !policiesDirty}
                      >
                        {savingPolicies
                          ? copy("Сохранение…")
                          : copy("Сохранить политики")}
                      </Button>
                    </form>
                  ) : (
                    <>
                      {!canManageDelegation &&
                        isSelfTarget &&
                        !access.user.superuser && (
                          <p className="text-xs text-muted-foreground">
                            {copy("Собственные политики меняет администратор.")}
                          </p>
                        )}
                      {access.policies.length ? (
                        <div className="flex flex-wrap gap-2">
                          {access.policies.map((policy) => (
                            <Badge
                              key={policy.id}
                              variant="secondary"
                            >
                              {policy.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {copy("Политики не назначены.")}
                        </p>
                      )}
                    </>
                  )}
                </section>
                <section className="space-y-3">
                  <h3 className="font-semibold">{copy("Разделы настроек")}</h3>
                  {access.sections.length ? (
                    <div className="flex flex-wrap gap-2">
                      {availableSettings(access.sections).map((section) => (
                        <Badge
                          key={section.id}
                          variant="secondary"
                        >
                          {copy(section.title)} ·{" "}
                          {access.editableSections.includes(section.id)
                            ? copy("Изменение")
                            : copy("Просмотр")}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {copy("Доступ к настройкам не выдан.")}
                    </p>
                  )}
                </section>
                {!access.user.superuser && (
                  <PolicyDelegationForm
                    userId={userId}
                    policies={policies}
                    initialIds={access.delegatablePolicyIds ?? []}
                    delegatingPolicyIds={delegatingPolicyIds}
                    editable={canManageDelegation}
                    onDirty={setDelegationDirty}
                    onBusy={setBusy}
                    onSaved={(ids) => {
                      setAccess(
                        (current) =>
                          current && { ...current, delegatablePolicyIds: ids },
                      );
                      void onDelegationSaved();
                    }}
                  />
                )}
                {!access.user.superuser && (
                  <section className="space-y-3">
                    <div>
                      <h3 className="font-semibold">
                        {copy("Права по политикам")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {copy(
                          "Объединение разрешений всех назначенных политик.",
                        )}
                      </p>
                    </div>
                    {access.permissions.length ? (
                      <div className="space-y-3">
                        {permissionGroups(access.permissions).map(
                          ([collectionName, permissions]) => {
                            const meta = collectionMap.get(collectionName);
                            const heading = meta?.displayName || collectionName;
                            return (
                              <div
                                key={collectionName}
                                className="space-y-3 rounded-lg border p-4"
                              >
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <h4
                                    className="font-medium"
                                    title={collectionName}
                                  >
                                    {heading}
                                  </h4>
                                  {meta?.displayName &&
                                    meta.displayName !== collectionName && (
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {collectionName}
                                      </span>
                                    )}
                                </div>
                                <div className="space-y-2.5">
                                  {permissions.map((permission) => {
                                    const excluded = excludedPermissionFields(
                                      permission,
                                      meta,
                                    );
                                    const visibleFields = permission.fields.map(
                                      (field) =>
                                        copy(
                                          resolveCollectionFieldLabel(
                                            field,
                                            meta,
                                          ),
                                        ),
                                    );
                                    return (
                                      <div
                                        key={permission.action}
                                        className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]"
                                      >
                                        <span className="font-medium">
                                          {copy(actionName[permission.action])}
                                        </span>
                                        <div className="space-y-1">
                                          <span className="break-words text-muted-foreground">
                                            {permission.action === "delete"
                                              ? copy("Вся запись")
                                              : permission.fields.includes("*")
                                                ? copy("Все поля")
                                                : visibleFields.join(", ")}
                                            {permission.rules?.some(
                                              (rule) => rule.rowFilter,
                                            ) && (
                                              <span className="ml-2 text-xs">
                                                {copy("· По условиям политик")}
                                              </span>
                                            )}
                                          </span>
                                          {excluded.length > 0 && (
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                              {accessText(
                                                copy.locale,
                                                `Скрытые поля (${excluded.length}): ${excluded.map((field) => field.label).join(", ")}`,
                                                `Hidden fields (${excluded.length}): ${excluded.map((field) => field.label).join(", ")}`,
                                              )}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {copy("Разрешений на коллекции нет.")}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
            <AccessConfirmDialog
              open={confirmStatusOpen}
              title={
                isDisabled
                  ? accessText(
                      copy.locale,
                      "Включить учётную запись?",
                      "Enable account?",
                    )
                  : accessText(
                      copy.locale,
                      "Отключить учётную запись?",
                      "Disable account?",
                    )
              }
              description={
                isDisabled
                  ? accessText(
                      copy.locale,
                      `Пользователь ${targetLabel} снова сможет войти в систему с сохранёнными политиками.`,
                      `${targetLabel} will be able to sign in again with their assigned policies.`,
                    )
                  : accessText(
                      copy.locale,
                      `Все активные сессии пользователя ${targetLabel} будут немедленно завершены, вход в систему станет недоступен.`,
                      `All active sessions for ${targetLabel} will be revoked immediately and sign-in will be blocked.`,
                    )
              }
              confirmLabel={
                busy
                  ? copy("Сохранение…")
                  : isDisabled
                    ? copy("Включить")
                    : copy("Отключить")
              }
              destructive={!isDisabled}
              busy={busy}
              onConfirm={toggleStatus}
              onCancel={() => setConfirmStatusOpen(false)}
            />
          </div>
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
