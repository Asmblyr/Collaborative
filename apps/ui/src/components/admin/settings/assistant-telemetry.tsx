"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { apiRequest } from "@/lib/api-request";
import { TelemetryTable } from "./telemetry-table";
import { tokenCount, type AssistantTelemetryResult } from "./telemetry-types";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantTelemetry() {
  const copy = useUiCopy();

  const [days, setDays] = useState("7");
  const [pages, setPages] = useState<string[]>([""]);
  const [until, setUntil] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: AssistantTelemetryResult;
    error?: string;
  } | null>(null);
  const params = new URLSearchParams({ days });
  if (until) params.set("until", until);
  if (pages.at(-1)) params.set("cursor", pages.at(-1)!);
  const query = params.toString(),
    key = `${query}#${revision}`;
  const current = result?.key === key ? result : null;
  const data = current?.data,
    busy = !current;

  useEffect(() => {
    let active = true;
    apiRequest<AssistantTelemetryResult>(
      `/api/settings/assistant/telemetry?${query}`,
    ).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : copy("Не удалось загрузить журнал"),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [key, query, copy]);

  function refresh(period = days) {
    setDays(period);
    setPages([""]);
    setUntil("");
    setRevision((value) => value + 1);
  }

  return (
    <div
      className="space-y-5"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{copy("Использование AI")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy(
              "Вызовы модели всех пользователей, без содержимого диалогов. Одно сообщение может включать несколько вызовов. ",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={days}
            onValueChange={refresh}
          >
            <SelectTrigger
              aria-label={copy("Период телеметрии")}
              className="w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{copy("За 24 часа")}</SelectItem>
              <SelectItem value="7">{copy("За 7 дней")}</SelectItem>
              <SelectItem value="30">{copy("За 30 дней")}</SelectItem>
              <SelectItem value="90">{copy("За 90 дней")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label={copy("Обновить телеметрию")}
            disabled={busy}
            onClick={() => refresh()}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      {busy && (
        <div
          className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" />
          {copy("Загружаем журнал… ")}
        </div>
      )}
      {current?.error && (
        <div
          className="rounded-xl border border-destructive/30 p-5"
          role="alert"
        >
          <p className="text-sm text-destructive">{current.error}</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => refresh()}
          >
            {copy("Повторить ")}
          </Button>
        </div>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: copy("Запросы"),
                value: data.summary.requests,
                Icon: Activity,
                note: copy("{{value0}} успешно · {{value1}} с ошибкой", {
                  value0: data.summary.succeeded,
                  value1: data.summary.failed,
                }),
              },
              {
                label: copy("Входные токены"),
                value: data.summary.inputTokens,
                Icon: ArrowUpRight,
                note: copy("Инструкции и контекст диалога"),
              },
              {
                label: copy("Выходные токены"),
                value: data.summary.outputTokens,
                Icon: ArrowDownLeft,
                note: copy("Ответ и размышления модели"),
              },
            ].map(({ label, value, Icon, note }) => (
              <Card
                key={label}
                className="[--card-spacing:--spacing(4)]"
              >
                <CardContent>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    {label}
                    <Icon className="size-4" />
                  </div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                    {tokenCount(value, copy.locale)}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {copy("Вход и выход известны для ")}
              {data.summary.withUsage} {copy(" из")} {data.summary.requests}{" "}
              {copy(" запросов ")}
            </span>
            {data.summary.cancelled > 0 && (
              <span>
                {copy("Отменено: ")}
                {data.summary.cancelled}
              </span>
            )}
            {data.summary.pending > 0 && (
              <span>
                {copy("Без итогового статуса: ")}
                {data.summary.pending}
              </span>
            )}
          </div>
          {data.items.length ? (
            <TelemetryTable
              items={data.items}
              until={data.period.until}
            />
          ) : (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <Activity className="mx-auto mb-3 size-6 text-muted-foreground" />
              <p className="font-medium">
                {copy("За этот период запросов нет")}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {copy("Новые обращения к ассистенту будут появляться здесь. ")}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {copy("Время — в вашем часовом поясе · обновлено")}{" "}
              {new Date(data.period.until).toLocaleTimeString(
                copy.locale === "en" ? "en-US" : "ru-RU",
              )}
            </span>
            {(pages.length > 1 || data.nextCursor) && (
              <Pagination
                className="m-0 w-auto"
                aria-label={copy("Страницы AI-запросов")}
              >
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pages.length === 1}
                      onClick={() => setPages((value) => value.slice(0, -1))}
                    >
                      <ChevronLeft />
                      {copy("Назад ")}
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-2 text-sm">{pages.length}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!data.nextCursor}
                      onClick={() => {
                        setUntil(data.period.until);
                        setPages((value) => [...value, data.nextCursor!]);
                      }}
                    >
                      {copy("Далее ")}
                      <ChevronRight />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </>
      )}
      <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
        {copy(
          "Учитываются обращения к провайдеру после проверки доступа и лимитов. «—» означает, что статистика не получена. Кэш входит во входные токены, размышления — в выходные. Это расход токенов, а не сумма списания по тарифу. Журнал хранится без автоудаления; обращения до его подключения не восстановятся. ",
        )}
      </p>
    </div>
  );
}
