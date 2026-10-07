"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { useUiCopy } from "@/lib/ui-copy";
import type { ApplicationDraft } from "./types";

export function ApplicationPermissions({
  draft,
  onChange,
}: {
  draft: ApplicationDraft;
  onChange: (draft: ApplicationDraft) => void;
}) {
  const copy = useUiCopy();
  function update(index: number, scope: string, name: string) {
    const scopes = [...draft.scopes];
    const scopeLabels = { ...draft.scopeLabels };
    delete scopeLabels[scopes[index]];
    scopes[index] = scope;
    if (name) scopeLabels[scope] = name;
    onChange({ ...draft, scopes, scopeLabels });
  }
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{copy("Разрешения приложения")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {draft.policyManaged
            ? copy(
                "Каталог доступных прав. Пользователь получает только то, что назначено ему в политиках.",
              )
            : copy(
                "Сервис может запросить эти права для любого пользователя, которому разрешён вход.",
              )}
        </p>
      </div>
      {draft.scopes.length > 0 && (
        <div className="space-y-2">
          {draft.scopes.map((scope, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_2rem]"
            >
              <Input
                className="col-start-1"
                aria-label={copy("Название разрешения {{value0}}", {
                  value0: index + 1,
                })}
                placeholder={copy("Например, Мониторинг")}
                maxLength={120}
                value={draft.scopeLabels[scope] ?? ""}
                onChange={(event) => update(index, scope, event.target.value)}
              />
              <Input
                className="col-start-1 row-start-2 font-mono text-xs sm:col-start-2 sm:row-start-1"
                aria-label={copy("Значение разрешения {{value0}}", {
                  value0: index + 1,
                })}
                placeholder="lavinmq.tag:monitoring"
                maxLength={160}
                value={scope}
                onChange={(event) =>
                  update(
                    index,
                    event.target.value,
                    draft.scopeLabels[scope] ?? "",
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="col-start-2 row-start-1 sm:col-start-3"
                aria-label={copy("Удалить разрешение {{value0}}", {
                  value0: index + 1,
                })}
                onClick={() => {
                  const scopeLabels = { ...draft.scopeLabels };
                  delete scopeLabels[scope];
                  onChange({
                    ...draft,
                    scopeLabels,
                    scopes: draft.scopes.filter(
                      (_, position) => position !== index,
                    ),
                  });
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={draft.scopes.length >= 30 || draft.scopes.includes("")}
        onClick={() => onChange({ ...draft, scopes: [...draft.scopes, ""] })}
      >
        <Plus className="size-4" />
        {copy("Добавить разрешение")}
      </Button>
    </section>
  );
}
