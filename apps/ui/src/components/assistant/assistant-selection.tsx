"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ListFilter, LoaderCircle } from "lucide-react";
import type {
  AssistantSelection,
  AssistantSelectionQuery,
} from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useAssistantContext } from "./assistant-context";
import { selectionHref } from "./selection-location";
import { navigateWithEditorGuard } from "@/components/collections/use-editor-navigation-guard";

export function AssistantSelectionCard({
  selection,
}: {
  selection: AssistantSelection;
}) {
  const router = useRouter();
  const page = useAssistantContext();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title =
    page?.collectionDisplayName(selection.collection) || selection.displayName;
  const editorOpen = page?.context?.table?.editorOpen;

  async function open() {
    setPending(true);
    setError("");
    try {
      const { collection, collectionId, q, filter, sort, direction } =
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
        },
      );
      navigateWithEditorGuard(() => router.push(selectionHref(checked)));
    } catch {
      setError(
        "Не удалось открыть подборку. Проверьте доступ или запросите её заново.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ListFilter className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-words">{title}</span>
        {selection.count !== null && (
          <span className="rounded-md bg-muted px-2 py-0.5 tabular-nums">
            {selection.count}
          </span>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Открыть таблицу с условиями этой подборки
        {selection.q ? ` и поиском «${selection.q}»` : ""}.
        {selection.count !== null && " Количество указано на момент ответа."}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={pending || editorOpen}
        onClick={() => void open()}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
        {pending ? "Проверяем доступ…" : "Открыть записи"}
      </Button>
      {editorOpen && (
        <p className="text-xs text-muted-foreground">
          Закройте редактор записи перед переходом.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
