"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { useUiCopy } from "@/lib/ui-copy";
import { contextLabel, type PageContext } from "./assistant-context-types";
import type { AssistantMessage } from "./assistant-types";
import { assistantContextState } from "./assistant-context-state";
import { AssistantContextHelp } from "./assistant-context-help";
import type { AssistantDataAccess } from "@asmblyr-collaborative/contracts";

export function AssistantContextControl({
  context,
  enabled,
  onEnabledChange,
  collectionDisplayName,
  workspaceName,
  messages,
  pending,
  dataAccess,
}: {
  context: PageContext;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  collectionDisplayName?: (name: string) => string | undefined;
  workspaceName?: string | null;
  messages: AssistantMessage[];
  pending: boolean;
  dataAccess: AssistantDataAccess;
}) {
  const copy = useUiCopy();
  const switchId = useId();
  const state = assistantContextState(
    messages,
    enabled ? context : null,
    pending,
    dataAccess,
  );
  let detail = copy("Данные и подключения · по запросу");
  if (!dataAccess.enabled) {
    detail = copy("Доступ к данным и подключениям выключен");
  } else if (enabled) {
    detail = context.record
      ? copy("Сохранённые данные · черновик не передаётся")
      : copy("{{value0}} · чтение данных и фильтры", {
          value0: workspaceName ?? copy("Все коллекции"),
        });
  }
  const label = contextLabel(
    enabled ? context : null,
    collectionDisplayName,
    copy,
    dataAccess,
  );

  return (
    <div className="mb-2.5 space-y-1.5">
      <div className="assistant-page-context flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
        <label
          htmlFor={switchId}
          className="min-w-0 flex-1 cursor-pointer"
        >
          <span
            className="block truncate font-medium"
            title={label}
          >
            {label}
          </span>
          <span className="assistant-context-detail block truncate text-[10px] text-muted-foreground">
            {detail}
          </span>
        </label>
        <AssistantContextHelp />
        <Switch
          id={switchId}
          aria-label={copy("Передавать контекст страницы")}
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {state.changed && (
        <p
          role="status"
          className="px-1 text-[11px] leading-4 text-muted-foreground"
        >
          {state.activeLabel !== null ? (
            <>
              <span
                className="block truncate"
                title={state.activeLabel}
              >
                {copy("Текущий ответ: {{value0}}", {
                  value0: state.activeLabel || copy("Прежний контекст"),
                })}
              </span>
              {copy("Следующий вопрос — с новым контекстом.")}
            </>
          ) : (
            copy("Контекст изменён · для ответа используется его история.")
          )}
        </p>
      )}
    </div>
  );
}
