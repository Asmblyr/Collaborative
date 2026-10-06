"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import type { AssistantStatusState } from "./assistant-status-state";

export function AssistantAvailability({
  state,
  onRetry,
}: {
  state: AssistantStatusState;
  onRetry: () => void;
}) {
  const copy = useUiCopy();
  if (state.phase === "ready") {
    return null;
  }
  if (state.phase === "loading") {
    return (
      <div
        role="status"
        className="flex shrink-0 items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground"
      >
        <LoaderCircle
          className="size-3 animate-spin"
          aria-hidden="true"
        />
        {copy("Проверяю подключение ассистента…")}
      </div>
    );
  }

  let message = copy(
    "Не удалось проверить подключение ассистента. Попробуйте ещё раз.",
  );
  if (state.phase === "disabled") {
    message = copy("Ассистент выключен или не настроен. Ваш диалог сохранён.");
  } else if (state.failure === "session") {
    message = copy("Сессия истекла. Войдите снова и повторите проверку.");
  } else if (state.failure === "access") {
    message = copy(
      "Нет доступа к ассистенту. Проверьте права и повторите проверку.",
    );
  }

  return (
    <div
      role="alert"
      className="flex max-h-32 shrink-0 items-center gap-3 overflow-y-auto border-t bg-muted/40 px-4 py-2.5"
    >
      <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        aria-label={copy("Повторить проверку ассистента")}
      >
        <RotateCcw />
        {copy("Повторить ")}
      </Button>
    </div>
  );
}
