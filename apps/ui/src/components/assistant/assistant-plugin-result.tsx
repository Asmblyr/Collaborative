"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, SquareFunction } from "lucide-react";
import type { AssistantPluginResult } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  loadPreparedAction,
  preparedActionHref,
} from "@/components/plugins/action-client";
import { pluginPageBlocksNavigation } from "@/components/plugins/page-state";
import { navigateWithEditorGuard } from "@/components/collections/use-editor-navigation-guard";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantPluginResultCard({
  result,
}: {
  result: AssistantPluginResult;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    if (pluginPageBlocksNavigation()) {
      setError(
        copy(
          "Сначала завершите расчёт или отмените изменения в текущей форме.",
        ),
      );
      return;
    }
    setPending(true);
    try {
      const draft = await loadPreparedAction(
        result.namespace,
        result.draftId,
        undefined,
        copy,
      );
      if (pluginPageBlocksNavigation())
        throw new Error(copy("В текущей форме появились изменения."));
      navigateWithEditorGuard(() => router.push(preparedActionHref(draft)));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : copy("Не удалось открыть форму."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SquareFunction className="size-4 text-muted-foreground" />
        {result.title}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {copy(
          "Параметры и результат готовы к просмотру и редактированию. Форма доступна до",
        )}{" "}
        {new Date(result.expiresAt).toLocaleTimeString("ru", {
          hour: "2-digit",
          minute: "2-digit",
        })}
        .
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => void open()}
      >
        <ArrowUpRight />
        {pending ? copy("Открываем…") : copy("Открыть страницу")}
      </Button>
      {error && (
        <p
          role="status"
          className="text-xs text-muted-foreground"
        >
          {copy(error)}
        </p>
      )}
    </div>
  );
}
