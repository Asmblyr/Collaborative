"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ListFilter, LoaderCircle } from "lucide-react";
import type {
  AssistantSelection,
  AssistantSelectionQuery,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import {
  formatSelectionCount,
  formatSelectionDescription,
  isNarrowViewport,
} from "./assistant-filter-format";
import { selectionHref } from "./selection-location";
import { navigateWithEditorGuard } from "@/components/ui/use-editor-navigation-guard";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantSelectionCard({
  selection,
}: {
  selection: AssistantSelection;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const page = useAssistantContext();
  const host = useAssistantHost();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title =
    page?.collectionDisplayName(selection.collection) || selection.displayName;
  const editorOpen = page?.context?.table?.editorOpen;
  const countLabel = formatSelectionCount(
    selection as AssistantSelection & { total?: string | number | null },
    copy.locale,
  );
  const description = formatSelectionDescription(
    copy("Открыть таблицу с условиями этой подборки"),
    selection.q
      ? copy("и поиском «{{value0}}»", { value0: selection.q })
      : null,
    countLabel ? copy("Количество указано на момент ответа.") : null,
  );

  async function open() {
    setPending(true);
    setError("");
    try {
      const { collection, collectionId, q, filter, sort, direction, order } =
        selection;
      const checked = await apiRequest<AssistantSelectionQuery>(
        "/api/assistant/selection/validate",
        "POST",
        {
          collection,
          collectionId,
          q,
          filter,
          sort,
          direction,
          ...(order ? { order } : {}),
        },
      );
      navigateWithEditorGuard(() => {
        if (isNarrowViewport()) {
          host?.setOpen(false);
        }
        router.push(selectionHref(checked));
      });
    } catch {
      setError(
        copy(
          "Не удалось открыть подборку. Проверьте доступ или запросите её заново.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const buttonLabel = countLabel
    ? `${copy("Открыть записи")} (${countLabel})`
    : copy("Открыть записи");

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ListFilter className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-words">{title}</span>
        {countLabel && (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
            {countLabel}
          </span>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={pending || editorOpen}
        onClick={() => void open()}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
        {pending ? copy("Проверяем доступ…") : buttonLabel}
      </Button>
      {editorOpen && (
        <p className="text-xs text-muted-foreground">
          {copy("Закройте редактор записи перед переходом.")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {copy(error)}
        </p>
      )}
    </div>
  );
}
