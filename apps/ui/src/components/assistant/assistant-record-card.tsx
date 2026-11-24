"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, FileText } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { navigateWithEditorGuard } from "@/components/ui/use-editor-navigation-guard";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import {
  formatFilterDecimal,
  isNarrowViewport,
} from "./assistant-filter-format";
import { recordCardHref } from "./assistant-form-handoff";
import type { AssistantRecordCard as RecordCardData } from "./assistant-types";

export function AssistantRecordCard({ record }: { record: RecordCardData }) {
  const copy = useUiCopy();
  const router = useRouter();
  const page = useAssistantContext();
  const host = useAssistantHost();
  const workspace = useWorkspace();

  const collectionTitle =
    page?.collectionDisplayName(record.collection) ||
    record.collectionDisplayName ||
    record.collection;

  function open() {
    const href = recordCardHref(
      record.collection,
      record.recordId,
      workspace?.href,
    );
    navigateWithEditorGuard(() => {
      if (isNarrowViewport()) {
        host?.setOpen(false);
      }
      router.push(href);
    });
  }

  return (
    <div
      data-slot="assistant-record-card"
      className="space-y-2.5 rounded-xl border bg-background p-3 text-xs"
    >
      <div className="flex items-start gap-2">
        <FileText
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {collectionTitle}
          </p>
          <p className="break-words text-sm font-medium leading-5 text-foreground">
            {record.title}
          </p>
        </div>
      </div>

      {record.summary && (
        <p className="leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {record.summary}
        </p>
      )}

      {record.fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-lg border bg-muted/30 px-2.5 py-2">
          {record.fields.map((entry) => (
            <div
              key={entry.field}
              className="contents"
            >
              <dt className="truncate text-muted-foreground">
                {entry.label || entry.field}
              </dt>
              <dd className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                {entry.value !== null && entry.value !== ""
                  ? formatFilterDecimal(entry.value)
                  : "—"}
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
        onClick={open}
      >
        <ArrowUpRight className="size-3.5" />
        {copy("Открыть запись")}
      </Button>
    </div>
  );
}
