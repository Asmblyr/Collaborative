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
import { Button } from "@asmblyr/kit/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { apiRequest } from "@/lib/api-request";
import { TelemetryTable } from "./telemetry-table";
import { tokenCount, type AssistantTelemetryResult } from "./telemetry-types";

export function AssistantTelemetry() {
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
                : "Не удалось загрузить журнал",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [key, query]);

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
          <h2 className="font-medium">Использование AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Вызовы модели всех пользователей, без содержимого диалогов. Одно
            сообщение может включать несколько вызовов.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={days}
            onValueChange={refresh}
          >
            <SelectTrigger
              aria-label="Период телеметрии"
              className="w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">За 24 часа</SelectItem>
              <SelectItem value="7">За 7 дней</SelectItem>
              <SelectItem value="30">За 30 дней</SelectItem>
              <SelectItem value="90">За 90 дней</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Обновить телеметрию"
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
          Загружаем журнал…
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
            Повторить
          </Button>
        </div>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Запросы",
                value: data.summary.requests,
                Icon: Activity,
                note: `${data.summary.succeeded} успешно · ${data.summary.failed} с ошибкой`,
              },
              {
                label: "Входные токены",
                value: data.summary.inputTokens,
                Icon: ArrowUpRight,
                note: "Инструкции и контекст диалога",
              },
              {
                label: "Выходные токены",
                value: data.summary.outputTokens,
                Icon: ArrowDownLeft,
                note: "Ответ и размышления модели",
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
                    {tokenCount(value)}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Вход и выход известны для {data.summary.withUsage} из{" "}
              {data.summary.requests} запросов
            </span>
            {data.summary.cancelled > 0 && (
              <span>Отменено: {data.summary.cancelled}</span>
            )}
            {data.summary.pending > 0 && (
              <span>Без итогового статуса: {data.summary.pending}</span>
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
              <p className="font-medium">За этот период запросов нет</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Новые обращения к ассистенту будут появляться здесь.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Время — в вашем часовом поясе · обновлено{" "}
              {new Date(data.period.until).toLocaleTimeString("ru-RU")}
            </span>
            {(pages.length > 1 || data.nextCursor) && (
              <Pagination
                className="m-0 w-auto"
                aria-label="Страницы AI-запросов"
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
                      Назад
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
                      Далее
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
        Учитываются обращения к провайдеру после проверки доступа и лимитов. «—»
        означает, что статистика не получена. Кэш входит во входные токены,
        размышления — в выходные. Это расход токенов, а не сумма списания по
        тарифу. Журнал хранится без автоудаления; обращения до его подключения
        не восстановятся.
      </p>
    </div>
  );
}
