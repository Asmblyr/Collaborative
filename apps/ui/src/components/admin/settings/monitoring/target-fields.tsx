"use client";

import { useId } from "react";
import { Monitor, Server } from "lucide-react";
import type {
  IntegrationSecret,
  MonitoringConnection,
} from "@asmblyr-collaborative/contracts";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";
import { SecretFields } from "../integrations/secret-fields";

export type MonitoringTab = "server" | "browser";
export interface MonitoringTargetProps {
  value: MonitoringConnection;
  onChange: (value: MonitoringConnection) => void;
  disabled: boolean;
  tab: MonitoringTab;
  onTabChange: (tab: MonitoringTab) => void;
  configured: Partial<Record<IntegrationSecret, boolean>>;
  draft: Partial<Record<IntegrationSecret, string | null>>;
  onSecretChange: (
    key: IntegrationSecret,
    value: string | null | undefined,
  ) => void;
}

const flags = [
  [
    "errorsCore",
    "Ошибки сервера",
    "Неожиданные ошибки API (5xx), без содержимого запроса.",
  ],
  [
    "performanceCore",
    "Производительность API",
    "Длительность запросов, p50/p95/p99 и выбранные трассировки.",
  ],
  [
    "databaseSpans",
    "Время SQL-операций",
    "Только тип операции и длительность внутри трассировки API; без SQL и значений.",
  ],
  [
    "errorsBrowser",
    "Ошибки интерфейса",
    "Ошибки JavaScript и необработанные отклонения Promise.",
  ],
  [
    "performanceBrowser",
    "Производительность интерфейса",
    "Загрузка страницы и обращения интерфейса к API.",
  ],
] as const;

export function MonitoringTargets(props: MonitoringTargetProps) {
  const copy = useUiCopy();
  const id = useId();
  return (
    <Tabs
      value={props.tab}
      onValueChange={(tab) =>
        props.onTabChange(tab === "browser" ? "browser" : "server")
      }
      className="space-y-4"
    >
      <TabsList
        aria-label={copy("Источники мониторинга")}
        className="w-full"
      >
        <TabsTrigger
          value="server"
          className="flex-1 gap-2"
        >
          <Server
            className="size-4"
            aria-hidden="true"
          />
          {copy("Сервер")}
        </TabsTrigger>
        <TabsTrigger
          value="browser"
          className="flex-1 gap-2"
        >
          <Monitor
            className="size-4"
            aria-hidden="true"
          />
          {copy("Интерфейс")}
        </TabsTrigger>
      </TabsList>
      {(["server", "browser"] as const).map((target) => (
        <TabsContent
          key={target}
          value={target}
          className="space-y-5"
        >
          <div className="space-y-2">
            <p className="text-sm leading-6 text-muted-foreground">
              {copy(
                target === "server"
                  ? "Обработка запросов API, ошибки сервера и SQL. Время p95/p99 не включает сеть и браузер."
                  : "Ошибки JavaScript, загрузка страниц и запросы из браузера. Их время включает сетевые задержки.",
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy(
                target === "server"
                  ? "Платформа проекта Sentry: Node.js."
                  : "Платформа проекта Sentry: Browser JavaScript.",
              )}
            </p>
          </div>
          <SecretFields
            names={[target === "server" ? "serverDsn" : "browserDsn"]}
            configured={props.configured}
            draft={props.draft}
            disabled={props.disabled}
            onChange={props.onSecretChange}
          />
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">
              {copy("Что собирать")}
            </legend>
            {flags
              .filter(([key]) =>
                target === "server"
                  ? ["errorsCore", "performanceCore", "databaseSpans"].includes(
                      key,
                    )
                  : ["errorsBrowser", "performanceBrowser"].includes(key),
              )
              .map(([key, label, description]) => (
                <div
                  key={key}
                  className="flex items-start gap-3"
                >
                  <Checkbox
                    id={`${id}-${key}`}
                    checked={props.value[key]}
                    disabled={
                      props.disabled ||
                      (key === "databaseSpans" && !props.value.performanceCore)
                    }
                    onCheckedChange={(checked) =>
                      props.onChange({
                        ...props.value,
                        [key]: checked === true,
                      })
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor={`${id}-${key}`}>{copy(label)}</Label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {copy(description)}
                    </p>
                  </div>
                </div>
              ))}
          </fieldset>
          {target === "browser" && (
            <p className="text-xs leading-5 text-muted-foreground">
              {copy(
                "DSN интерфейса содержит публичный ключ приёма событий, доступный авторизованным пользователям при включённом сборе в браузере.",
              )}
            </p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
