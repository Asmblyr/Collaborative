"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  LoaderCircle,
  PencilLine,
  PlusCircle,
  X,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { itemHref } from "@/lib/item-location";
import { useUiCopy } from "@/lib/ui-copy";
import { navigateWithEditorGuard } from "@/components/ui/use-editor-navigation-guard";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import { isNarrowViewport } from "./assistant-filter-format";
import type { AssistantWriteProposalCard } from "./assistant-types";
import {
  beginWriteProposalAction,
  completeWriteProposalConfirm,
  completeWriteProposalReject,
  failWriteProposalAction,
  formatProposalValue,
  initialWriteProposalState,
  type WriteProposalConfirmResponse,
  type WriteProposalRejectResponse,
} from "./assistant-write-proposal-state";

export function AssistantWriteProposal({
  proposal,
}: {
  proposal: AssistantWriteProposalCard;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const page = useAssistantContext();
  const host = useAssistantHost();
  const workspace = useWorkspace();
  const [state, setState] = useState(() => initialWriteProposalState(proposal));

  const collectionTitle =
    page?.collectionDisplayName(proposal.collection) ||
    proposal.collectionDisplayName ||
    proposal.collection;
  const isCreate = proposal.operation === "create";
  const busy = state.status === "confirming" || state.status === "rejecting";
  const actionable = state.status === "pending" || busy;

  async function confirm() {
    if (state.status !== "pending") {
      return;
    }
    setState((current) => beginWriteProposalAction(current, "confirm"));
    try {
      const response = await apiRequest<WriteProposalConfirmResponse>(
        `/api/assistant/write-proposals/${encodeURIComponent(proposal.proposalId)}/confirm`,
        "POST",
        {},
      );
      setState((current) => completeWriteProposalConfirm(current, response));
      router.refresh();
    } catch (failure) {
      setState((current) => failWriteProposalAction(current, failure, copy));
    }
  }

  async function reject() {
    if (state.status !== "pending") {
      return;
    }
    setState((current) => beginWriteProposalAction(current, "reject"));
    try {
      await apiRequest<WriteProposalRejectResponse>(
        `/api/assistant/write-proposals/${encodeURIComponent(proposal.proposalId)}/reject`,
        "POST",
        {},
      );
      setState((current) => completeWriteProposalReject(current));
    } catch (failure) {
      setState((current) => failWriteProposalAction(current, failure, copy));
    }
  }

  function openRecord(recordId: string) {
    const baseHref = itemHref(proposal.collection, recordId);
    const href = workspace?.href(baseHref) ?? baseHref;
    navigateWithEditorGuard(() => {
      if (isNarrowViewport()) {
        host?.setOpen(false);
      }
      router.push(href);
    });
  }

  return (
    <div
      data-slot="assistant-write-proposal"
      data-status={state.status}
      className="space-y-2.5 rounded-xl border bg-background p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={
            isCreate
              ? "inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1 rounded-md border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300"
          }
        >
          {isCreate ? (
            <PlusCircle
              className="size-3"
              aria-hidden="true"
            />
          ) : (
            <PencilLine
              className="size-3"
              aria-hidden="true"
            />
          )}
          {isCreate ? copy("Создание") : copy("Обновление")}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {collectionTitle}
        </span>
        {state.status === "confirmed" && (
          <span
            role="status"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
          >
            <Check
              className="size-3"
              aria-hidden="true"
            />
            {copy("Подтверждено")}
          </span>
        )}
        {state.status === "rejected" && (
          <span
            role="status"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <X
              className="size-3"
              aria-hidden="true"
            />
            {copy("Отменено")}
          </span>
        )}
      </div>

      {proposal.summary && (
        <p className="leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {proposal.summary}
        </p>
      )}

      {proposal.diff.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-muted/30">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
                <th className="px-2.5 py-1.5 font-medium">{copy("Поле")}</th>
                {isCreate ? (
                  <th className="px-2.5 py-1.5 font-medium">
                    {copy("Значение")}
                  </th>
                ) : (
                  <th className="px-2.5 py-1.5 font-medium">
                    {copy("Было")} → {copy("Станет")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {proposal.diff.map((entry) => (
                <tr key={entry.field}>
                  <td className="align-top px-2.5 py-1.5 font-medium text-muted-foreground [overflow-wrap:anywhere]">
                    {entry.label || entry.field}
                  </td>
                  <td className="align-top px-2.5 py-1.5 text-foreground [overflow-wrap:anywhere]">
                    {isCreate ? (
                      <span>{formatProposalValue(entry.after, copy)}</span>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                          {formatProposalValue(entry.before, copy)}
                        </span>
                        <ArrowRight
                          className="size-3 shrink-0 self-center text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-foreground">
                          {formatProposalValue(entry.after, copy)}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">{copy("Изменения не указаны.")}</p>
      )}

      {actionable && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {state.status === "confirming" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {state.status === "confirming"
              ? copy("Подтверждаем…")
              : copy("Подтвердить")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void reject()}
          >
            {state.status === "rejecting" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            {state.status === "rejecting"
              ? copy("Отменяем…")
              : copy("Отменить")}
          </Button>
        </div>
      )}

      {state.status === "confirmed" && state.recordId && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => openRecord(state.recordId!)}
        >
          <ArrowUpRight className="size-3.5" />
          {copy("Открыть запись")}
        </Button>
      )}

      {state.error && (
        <p
          role="alert"
          className="text-xs leading-5 text-destructive"
        >
          {copy(state.error)}
        </p>
      )}
    </div>
  );
}
