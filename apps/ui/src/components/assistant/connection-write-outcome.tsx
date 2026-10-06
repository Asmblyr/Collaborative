"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import type { WriteCardState, WriteCardStatus } from "./connection-write-state";

const labels: Record<WriteCardStatus, string> = {
  checking: "Проверяю статус…",
  submitting: "Обрабатываю решение…",
  pending: "Ожидает подтверждения",
  executing: "Проверьте результат",
  uncertain: "Проверьте результат",
  cancelled: "Отклонено",
  succeeded: "Выполнено",
  failed: "Не выполнено",
  unavailable: "Предложение недоступно",
  check_failed: "Не удалось проверить",
};

export function ConnectionWriteOutcome({ state }: { state: WriteCardState }) {
  const copy = useUiCopy();
  let Icon = CircleDashed;
  let color = "text-muted-foreground";
  let description = "";
  if (state.status === "succeeded") {
    Icon = CheckCircle2;
    color = "text-emerald-700 dark:text-emerald-400";
    description = "Изменение выполнено в Google.";
  } else if (state.status === "cancelled") {
    Icon = Ban;
    description = "Предложение отклонено. Изменения не отправлены в Google.";
  } else if (state.status === "failed") {
    Icon = XCircle;
    color = "text-destructive";
    description =
      state.detail?.failure === "target_changed"
        ? "Данные изменились после подготовки. Запросите новое предложение."
        : "Изменение не отправлено. Запросите новое предложение после устранения ошибки.";
  } else if (state.status === "uncertain" || state.status === "executing") {
    Icon = AlertTriangle;
    color = "text-amber-700 dark:text-amber-400";
    description =
      "Результат не подтверждён. Проверьте файл в Google перед новой операцией.";
  } else if (state.status === "checking" || state.status === "submitting") {
    Icon = Loader2;
  } else if (state.status === "unavailable") {
    description = "Предложение истекло или подключение недоступно.";
  } else if (state.status === "check_failed") {
    description =
      "Не удалось загрузить статус. Повторите проверку; изменение не отправляется повторно.";
  }
  const result = state.status === "succeeded" ? state.detail?.result : null;
  return (
    <div
      className="space-y-1 text-xs"
      role="status"
    >
      <p className={`flex items-center gap-1.5 font-medium ${color}`}>
        <Icon
          aria-hidden
          className={`size-3.5 shrink-0 ${state.status === "checking" || state.status === "submitting" ? "animate-spin" : ""}`}
        />
        {copy(labels[state.status])}
      </p>
      {description && (
        <p className="text-muted-foreground">{copy(description)}</p>
      )}
      {result?.updatedCells != null && (
        <p>
          {copy("Изменено ячеек: {{value0}}", { value0: result.updatedCells })}
        </p>
      )}
      {result?.updatedRows != null && (
        <p>
          {copy("Изменено строк: {{value0}}", { value0: result.updatedRows })}
        </p>
      )}
      {result?.range && (
        <p className="break-words text-muted-foreground">{result.range}</p>
      )}
      {state.refreshFailed &&
        state.status !== "check_failed" &&
        state.status !== "unavailable" && (
          <p className="text-muted-foreground">
            {copy(
              "Не удалось обновить сведения. Показан последний известный результат.",
            )}
          </p>
        )}
    </div>
  );
}

export function ConnectionWriteLink({ state }: { state: WriteCardState }) {
  const copy = useUiCopy();
  const url = state.detail?.result?.url ?? state.detail?.url;
  if (!url) {
    return null;
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      asChild
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink
          aria-hidden
          className="size-3.5"
        />
        {copy("Открыть в Google")}
      </a>
    </Button>
  );
}
