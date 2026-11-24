"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, FilePlus2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { navigateWithEditorGuard } from "@/components/ui/use-editor-navigation-guard";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import { isNarrowViewport } from "./assistant-filter-format";
import {
  dispatchFormPrefillEvent,
  formCardHref,
  isOnCollectionListPath,
  stageFormPrefill,
} from "./assistant-form-handoff";
import { formatProposalValue } from "./assistant-write-proposal-state";
import type { AssistantFormCard as FormCardData } from "./assistant-types";

export function AssistantFormCard({ form }: { form: FormCardData }) {
  const copy = useUiCopy();
  const router = useRouter();
  const page = useAssistantContext();
  const host = useAssistantHost();
  const workspace = useWorkspace();

  const collectionTitle =
    page?.collectionDisplayName(form.collection) ||
    form.collectionDisplayName ||
    form.collection;

  function openForm() {
    const href = formCardHref(form.collection, workspace?.href);
    navigateWithEditorGuard(() => {
      stageFormPrefill(form.collection, form.values);
      if (isNarrowViewport()) {
        host?.setOpen(false);
      }
      if (
        typeof window !== "undefined" &&
        isOnCollectionListPath(window.location.pathname, form.collection)
      ) {
        dispatchFormPrefillEvent(form.collection);
        return;
      }
      router.push(href);
    });
  }

  return (
    <div
      data-slot="assistant-form-card"
      className="space-y-2.5 rounded-xl border bg-background p-3 text-xs"
    >
      <div className="flex items-start gap-2">
        <FilePlus2
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {copy("Новая запись")}
          </p>
          <p className="break-words text-sm font-medium leading-5 text-foreground">
            {collectionTitle}
          </p>
        </div>
      </div>

      {form.summary && (
        <p className="leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {form.summary}
        </p>
      )}

      {form.fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-lg border bg-muted/30 px-2.5 py-2">
          {form.fields.map((entry) => (
            <div
              key={entry.field}
              className="contents"
            >
              <dt className="truncate text-muted-foreground">
                {entry.label || entry.field}
              </dt>
              <dd className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                {formatProposalValue(entry.value, copy)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={openForm}
      >
        <ArrowUpRight className="size-3.5" />
        {copy("Открыть форму создания")}
      </Button>
    </div>
  );
}
