"use client";

import { SettingsReadOnlyNotice } from "./read-only-notice";
import { Badge } from "@/components/ui/badge";
import { AssistantTabs } from "./assistant-tabs";
import type { AssistantSystemSettings } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function SystemSettingsWorkspace({
  readOnly = false,
  initial,
}: {
  readOnly?: boolean;
  initial: AssistantSystemSettings;
}) {
  const copy = useUiCopy();

  return (
    <div>
      <section
        className="min-w-0 space-y-6"
        aria-labelledby="assistant-settings-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              id="assistant-settings-title"
              className="text-xl font-semibold tracking-tight"
            >
              {copy("AI-ассистент ")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {copy("Поведение помощника и использование моделей в Asmblyr. ")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 font-normal"
          >
            <span
              className={`size-1.5 rounded-full ${initial.configured ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            {initial.configured
              ? copy("Подключение настроено")
              : copy("Требуется подключение")}
          </Badge>
        </div>
        <SettingsReadOnlyNotice readOnly={readOnly} />
        <AssistantTabs
          readOnly={readOnly}
          initial={initial}
        />
      </section>
    </div>
  );
}
