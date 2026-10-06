"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantHost } from "./assistant-host";

export function AssistantDataControl() {
  const copy = useUiCopy();
  const host = useAssistantHost();
  const id = useId();
  if (!host) {
    return null;
  }
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="min-w-0 flex-1 cursor-pointer text-sm font-medium"
        >
          {copy("Доступ к данным и подключениям")}
        </label>
        <Switch
          id={id}
          aria-label={copy("Доступ к данным и подключениям")}
          checked={host.dataEnabled}
          onCheckedChange={host.setDataEnabled}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {copy(
          "Разрешить ассистенту использовать базу, Google и инструменты расширений по вашим запросам. Права пользователя и подтверждения изменений сохраняются.",
        )}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {copy(
          "Контекст страницы включается отдельно под сообщением. Выключение доступа не удаляет подключённые аккаунты и действует на следующие вопросы.",
        )}
      </p>
    </div>
  );
}
