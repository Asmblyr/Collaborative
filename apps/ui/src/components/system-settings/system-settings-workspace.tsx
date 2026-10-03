import { SettingsReadOnlyNotice } from "./read-only-notice";
import { Badge } from "@/components/ui/badge";
import { AssistantTabs } from "./assistant-tabs";
import type { AssistantSystemSettings } from "./types";

export function SystemSettingsWorkspace({
  readOnly = false,
  initial,
}: {
  readOnly?: boolean;
  initial: AssistantSystemSettings;
}) {
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
              AI-ассистент
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Поведение помощника и использование моделей в Asmblyr.
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
              ? "Подключение настроено"
              : "Требуется подключение"}
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
