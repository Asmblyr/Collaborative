"use client";

import { availableSettings } from "@/components/system-settings/sections";
import { useEffect, useState } from "react";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Badge } from "@/components/ui/badge";
import { accessRequest } from "@/lib/access-request";
import { actionName, type EffectivePermission, type UserAccess } from "./types";
import type { Policy } from "./types";
import { PolicyDelegationForm } from "./policy-delegation-form";

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
  policies,
  canManageDelegation = false,
  onDelegationSaved,
  onClose,
}: {
  userId: string;
  email: string;
  policies: Policy[];
  canManageDelegation?: boolean;
  onDelegationSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    accessRequest<{ data: UserAccess }>(`/users/${userId}/access`)
      .then((result) => {
        if (current) {
          setAccess(result.data);
        }
      })
      .catch((cause) => {
        if (current) {
          setError((cause as Error).message);
        }
      });
    return () => {
      current = false;
    };
  }, [userId]);

  return (
    <EditorDialog
      open
      title={`Доступ: ${email}`}
      eyebrow="Пользователь"
      size="wide"
      busy={busy}
      hasUnsavedChanges={dirty}
      onClose={onClose}
    >
      {() => (
        <div className="space-y-7 pb-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {!access && !error && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              Загружаем права…
            </p>
          )}
          {access && (
            <>
              {access.user.status === "disabled" && (
                <p className="rounded-lg border p-3 text-sm">
                  Учётная запись отключена. Назначения сохранены, но сейчас
                  войти и использовать права нельзя.
                </p>
              )}
              {!access.user.hasPassword &&
                !access.user.superuser &&
                access.user.status === "active" && (
                  <p className="rounded-lg border p-3 text-sm">
                    Приглашение ещё не принято. Права начнут действовать после
                    входа.
                  </p>
                )}
              {access.user.superuser && (
                <p className="rounded-lg border p-3 text-sm">
                  {access.user.status === "disabled"
                    ? "После включения учётной записи суперпользователь получит полный доступ к коллекциям и структуре."
                    : "Суперпользователь имеет полный доступ к коллекциям и структуре без разрешений в политиках."}
                </p>
              )}
              <section className="space-y-3">
                <h3 className="font-semibold">Назначенные политики</h3>
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
                    Политики не назначены.
                  </p>
                )}
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Разделы настроек</h3>
                {access.sections.length ? (
                  <div className="flex flex-wrap gap-2">
                    {availableSettings(access.sections).map((section) => (
                      <Badge
                        key={section.id}
                        variant="secondary"
                      >
                        {section.title} ·{" "}
                        {access.editableSections.includes(section.id)
                          ? "Изменение"
                          : "Просмотр"}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Доступ к настройкам не выдан.
                  </p>
                )}
              </section>
              {!access.user.superuser && (
                <PolicyDelegationForm
                  userId={userId}
                  policies={policies}
                  initialIds={access.delegatablePolicyIds ?? []}
                  editable={canManageDelegation}
                  onDirty={setDirty}
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
                    <h3 className="font-semibold">Права по политикам</h3>
                    <p className="text-sm text-muted-foreground">
                      Объединение разрешений всех назначенных политик.
                    </p>
                  </div>
                  {access.permissions.length ? (
                    <div className="space-y-3">
                      {permissionGroups(access.permissions).map(
                        ([collection, permissions]) => (
                          <div
                            key={collection}
                            className="space-y-3 rounded-lg border p-4"
                          >
                            <h4 className="font-medium">{collection}</h4>
                            <div className="space-y-2">
                              {permissions.map((permission) => (
                                <div
                                  key={permission.action}
                                  className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]"
                                >
                                  <span className="font-medium">
                                    {actionName[permission.action]}
                                  </span>
                                  <span className="break-words text-muted-foreground">
                                    {permission.action === "delete"
                                      ? "Вся запись"
                                      : permission.fields.includes("*")
                                        ? "Все поля"
                                        : permission.fields.join(", ")}
                                    {permission.rules?.some(
                                      (rule) => rule.rowFilter,
                                    ) && (
                                      <span className="ml-2 text-xs">
                                        · По условиям политик
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Разрешений на коллекции нет.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
