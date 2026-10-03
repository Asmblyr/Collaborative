"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tokenCount, type AssistantRequest } from "./telemetry-types";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AssistantUsageSummary } from "@/components/assistant/assistant-usage-summary";

const statusLabels = {
  succeeded: "Готово",
  failed: "Ошибка",
  cancelled: "Отменён",
  pending: "В работе",
};
const effortLabels: Record<string, string> = {
  low: "Быстро",
  medium: "Средняя глубина",
  high: "Вдумчиво",
  max: "Максимум",
};

function RequestStatus({ item, now }: { item: AssistantRequest; now: number }) {
  const missing =
    item.status === "pending" && now - Date.parse(item.startedAt) > 180_000;
  const label = missing
    ? "Нет итога"
    : item.truncated
      ? "Неполный ответ"
      : statusLabels[item.status];
  const hint = missing
    ? "Итог не записан: запрос мог быть прерван или журнал недоступен. Расход неизвестен."
    : (item.errorCode ??
      (item.truncated ? "Ответ достиг ограничения длины." : item.finishReason));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          variant={item.status === "failed" ? "destructive" : "secondary"}
          className={
            item.status === "succeeded" && !item.truncated
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : ""
          }
        >
          {label}
        </Badge>
      </TooltipTrigger>
      {hint && <TooltipContent>{hint}</TooltipContent>}
    </Tooltip>
  );
}

export function TelemetryTable({
  items,
  until,
}: {
  items: AssistantRequest[];
  until: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="min-w-[760px] text-sm">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="pl-4">Время</TableHead>
            <TableHead>Пользователь</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead className="text-right">Вход</TableHead>
            <TableHead className="text-right">Выход</TableHead>
            <TableHead className="text-right">Длительность</TableHead>
            <TableHead>Результат вызова</TableHead>
            <TableHead className="pr-4">Сообщение целиком</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="py-3.5 pl-4 tabular-nums">
                <time dateTime={item.startedAt}>
                  <span className="block">
                    {new Date(item.startedAt).toLocaleTimeString("ru-RU")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.startedAt).toLocaleDateString("ru-RU")}
                  </span>
                </time>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="mt-1 block text-[10px] text-muted-foreground"
                    >
                      {item.turnId.slice(0, 8)} · вызов {item.callIndex}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Сообщение {item.turnId}. Каждый вызов модели учитывается
                    отдельно.
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="max-w-44">
                <div className="truncate font-medium">
                  {item.user.displayName ||
                    item.user.email ||
                    "Удалённый пользователь"}
                </div>
                {(item.user.displayName || !item.user.email) && (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.user.email ?? item.user.id}
                  </div>
                )}
              </TableCell>
              <TableCell className="max-w-48">
                <div className="truncate font-medium">
                  {item.model ?? item.requestedModel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.provider === "zai"
                    ? "Z.ai"
                    : item.provider === "openai"
                      ? "OpenAI"
                      : "Совместимый API"}
                  {item.reasoningEffort
                    ? ` · ${effortLabels[item.reasoningEffort] ?? item.reasoningEffort}`
                    : ""}
                </div>
                {!item.model && (
                  <div className="text-xs text-muted-foreground">
                    Запрошенная модель
                  </div>
                )}
                {item.model && item.model !== item.requestedModel && (
                  <div className="truncate text-xs text-muted-foreground">
                    Запрошена: {item.requestedModel}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span
                  aria-label={
                    item.usage.inputTokens === null
                      ? "Нет данных о входных токенах"
                      : undefined
                  }
                >
                  {tokenCount(item.usage.inputTokens)}
                </span>
                {item.usage.cachedTokens !== null && (
                  <div className="text-xs text-muted-foreground">
                    кэш: {tokenCount(item.usage.cachedTokens)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span
                  aria-label={
                    item.usage.outputTokens === null
                      ? "Нет данных о выходных токенах"
                      : undefined
                  }
                >
                  {tokenCount(item.usage.outputTokens)}
                </span>
                {item.usage.reasoningTokens !== null && (
                  <div className="text-xs text-muted-foreground">
                    размышления: {tokenCount(item.usage.reasoningTokens)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.durationMs === null
                  ? "—"
                  : `${(item.durationMs / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`}
              </TableCell>
              <TableCell>
                <RequestStatus
                  item={item}
                  now={Date.parse(until)}
                />
              </TableCell>
              <TableCell className="pr-4">
                {item.turnSummary ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-auto px-2 py-1 text-xs"
                      >
                        {statusLabels[item.turnSummary.status]} ·{" "}
                        {item.turnSummary.modelCalls} выз. ·{" "}
                        {item.turnSummary.toolCalls} инстр.
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-80 space-y-3"
                    >
                      <p className="text-sm font-medium">
                        Итог сообщения · {statusLabels[item.turnSummary.status]}
                      </p>
                      <AssistantUsageSummary summary={item.turnSummary} />
                      {item.turnSummary.errorCode && (
                        <p className="break-all text-xs text-destructive">
                          {item.turnSummary.errorCode}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {item.turnId}
                      </p>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
