"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useUiCopy } from "@/lib/ui-copy";
import { apiRequest } from "@/lib/api-request";

interface ApplicationGrant {
  appId: string;
  scopes: string[];
}
interface PolicyApplication {
  id: string;
  name: string;
  enabled: boolean;
  scopes: string[];
  scopeLabels: Record<string, string>;
}

export function usePolicyApplications(open: boolean, policyId?: string) {
  const [catalog, setCatalog] = useState<PolicyApplication[]>([]);
  const [selected, setSelected] = useState<ApplicationGrant[]>([]);
  const [initial, setInitial] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    Promise.all([
      apiRequest<PolicyApplication[]>("/api/policies/applications"),
      policyId
        ? apiRequest<{ applications: ApplicationGrant[] }>(
            `/api/policies/${policyId}`,
          )
        : Promise.resolve({ applications: [] }),
    ])
      .then(([apps, policy]) => {
        if (!active) {
          return;
        }
        setCatalog(apps);
        setSelected(policy.applications);
        setInitial(JSON.stringify(policy.applications));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить приложения",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, policyId, attempt]);
  return {
    catalog,
    selected,
    setSelected,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setError("");
      setAttempt((value) => value + 1);
    },
    dirty: JSON.stringify(selected) !== initial,
  };
}

export function PolicyApplications({
  state,
  disabled,
}: {
  state: ReturnType<typeof usePolicyApplications>;
  disabled: boolean;
}) {
  const copy = useUiCopy();
  if (state.loading) {
    return (
      <p
        role="status"
        className="text-sm text-muted-foreground"
      >
        {copy("Загружаем приложения…")}
      </p>
    );
  }
  if (state.error) {
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {copy(state.error)}
      </p>
    );
  }
  if (!state.catalog.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        {copy(
          "Включите управление через политики в настройках OAuth-приложения, чтобы назначить ему доступ здесь.",
        )}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {copy(
          "Разрешения складываются с другими политиками пользователя. Изменения применяются при новом входе; выданный токен действует до 5 минут.",
        )}
      </p>
      {state.catalog.map((app) => {
        const grant = state.selected.find((grant) => grant.appId === app.id);
        function replace(next?: ApplicationGrant) {
          state.setSelected((current) => [
            ...current.filter((grant) => grant.appId !== app.id),
            ...(next ? [next] : []),
          ]);
        }
        return (
          <section
            key={app.id}
            className="rounded-lg border"
          >
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <h3 className="text-sm font-medium">{app.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {app.enabled
                    ? copy("Разрешить вход")
                    : copy("Приложение выключено · вход недоступен")}
                </p>
              </div>
              <Switch
                aria-label={copy("Разрешить вход в {{value0}}", {
                  value0: app.name,
                })}
                checked={Boolean(grant)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  replace(checked ? { appId: app.id, scopes: [] } : undefined)
                }
              />
            </div>
            {grant && (
              <div className="space-y-3 border-t p-4">
                {app.scopes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {copy(
                      "Только вход и передача профиля. Дополнительные разрешения не настроены.",
                    )}
                  </p>
                )}
                {app.scopes.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={grant.scopes.includes(scope)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        replace({
                          appId: app.id,
                          scopes:
                            checked === true
                              ? [...new Set([...grant.scopes, scope])]
                              : grant.scopes.filter((value) => value !== scope),
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block break-words">
                        {app.scopeLabels[scope] ?? scope}
                      </span>
                      {app.scopeLabels[scope] && (
                        <span className="mt-0.5 block break-all font-mono text-xs text-muted-foreground">
                          {scope}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
