"use client";

import { useMemo, useState } from "react";
import { Check, ListFilter, LoaderCircle } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { describeFilter } from "@/components/items/item-filter-description";
import {
  canApplyProposal,
  type FilterProposal,
} from "./assistant-context-types";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import {
  collectionFilterMetadata,
  isNarrowViewport,
  normalizeFilterGroup,
} from "./assistant-filter-format";
import { useAssistantCatalog } from "./use-assistant-catalog";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantFilterProposal({
  proposal,
}: {
  proposal: FilterProposal;
}) {
  const copy = useUiCopy();

  const page = useAssistantContext();
  const host = useAssistantHost();
  const catalog = useAssistantCatalog(
    proposal.workspaceId ?? page?.context?.workspaceId ?? null,
  );
  const metadata = useMemo(
    () => collectionFilterMetadata(proposal.collection, catalog),
    [proposal.collection, catalog],
  );
  const formattedFilter = useMemo(
    () => normalizeFilterGroup(proposal.filter),
    [proposal.filter],
  );
  const collectionName =
    page?.collectionDisplayName(proposal.collection) ||
    proposal.collectionDisplayName ||
    proposal.collection;
  const [pending, setPending] = useState(false),
    [applied, setApplied] = useState(false),
    [error, setError] = useState("");
  const available = canApplyProposal(page?.context ?? null, proposal);
  async function apply() {
    setPending(true);
    setError("");
    setApplied(false);
    try {
      await page!.apply(proposal);
      setApplied(true);
      if (isNarrowViewport()) {
        host?.setOpen(false);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : copy("Не удалось применить фильтр"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2.5 rounded-xl border bg-background p-3 text-xs">
      <p className="flex items-center gap-2 font-medium">
        <ListFilter className="size-3.5" />
        {copy("Фильтр ·")} {collectionName}
      </p>
      <p className="max-h-36 overflow-auto whitespace-pre-wrap break-words leading-5 text-muted-foreground">
        {formattedFilter.children.length
          ? describeFilter(
              formattedFilter,
              metadata.labels,
              metadata.choices,
              copy,
            )
          : copy("Все записи без фильтра")}
      </p>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {copy("Заменит текущие фильтры. Поисковый запрос сохранится.")}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={!available || pending}
        onClick={() => void apply()}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" />
        ) : applied ? (
          <Check />
        ) : (
          <ListFilter />
        )}
        {pending
          ? copy("Проверяем…")
          : applied
            ? copy("Применить ещё раз")
            : copy("Применить фильтр")}
      </Button>
      {applied && (
        <p
          role="status"
          className="text-muted-foreground"
        >
          {copy("Фильтр применён")}
        </p>
      )}
      {!available && (
        <p className="text-muted-foreground">
          {copy("Откройте")} {collectionName}{" "}
          {copy("в исходном workspace и закройте редактор.")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-destructive"
        >
          {copy(error)}
        </p>
      )}
    </div>
  );
}
