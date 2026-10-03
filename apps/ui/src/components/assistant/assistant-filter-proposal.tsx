"use client";

import { useState } from "react";
import { Check, ListFilter, LoaderCircle } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { describeFilter } from "@/components/items/item-filter-description";
import { canApplyProposal, type FilterProposal } from "./assistant-context-types";
import { useAssistantContext } from "./assistant-context";

export function AssistantFilterProposal({ proposal }: { proposal: FilterProposal }) {
  const page = useAssistantContext();
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось применить фильтр");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2.5 rounded-xl border bg-background p-3 text-xs">
      <p className="flex items-center gap-2 font-medium">
        <ListFilter className="size-3.5" />
        Фильтр · {collectionName}
      </p>
      <p className="max-h-36 overflow-auto whitespace-pre-wrap break-words leading-5 text-muted-foreground">
        {proposal.filter.children.length
          ? describeFilter(proposal.filter)
          : "Все записи без фильтра"}
      </p>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Заменит текущие фильтры. Поисковый запрос сохранится.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={!available || pending}
        onClick={() => void apply()}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : applied ? <Check /> : <ListFilter />}
        {pending ? "Проверяем…" : applied ? "Применить ещё раз" : "Применить фильтр"}
      </Button>
      {applied && (
        <p role="status" className="text-muted-foreground">
          Фильтр применён
        </p>
      )}
      {!available && (
        <p className="text-muted-foreground">
          Откройте {collectionName} в исходном workspace и закройте редактор.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
