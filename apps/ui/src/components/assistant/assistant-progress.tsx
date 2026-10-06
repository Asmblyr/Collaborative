"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Square } from "lucide-react";
import type {
  AssistantActivity,
  AssistantProgress as Progress,
  AssistantTurnSummary,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import { AssistantUsageSummary } from "./assistant-usage-summary";
import { AssistantMessageContent } from "./assistant-message-content";

export function AssistantProgress({
  activity = [],
  draft = "",
  working,
  startedAt,
  progress,
  summary,
  stopping,
  onStop,
}: {
  activity?: AssistantActivity[];
  draft?: string;
  working: boolean;
  startedAt?: number;
  progress: Progress | null;
  summary?: AssistantTurnSummary;
  stopping: boolean;
  onStop: () => void;
}) {
  const copy = useUiCopy();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [working]);
  const seconds = working
    ? Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000))
    : Math.round((summary?.durationMs ?? 0) / 1000);

  if (working) {
    const notes = activity.filter((entry) => entry.kind === "note");
    return (
      <div className="space-y-3 text-xs leading-5 text-muted-foreground">
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <p className="tabular-nums">
            {copy("Работает уже {{value0}} с", { value0: seconds })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={stopping}
            onClick={onStop}
            aria-label={copy("Остановить запрос")}
          >
            <Square className="size-3" />
          </Button>
        </div>
        {notes.map((note, index) => (
          <AssistantMessageContent
            key={index}
            content={note.text}
            compact
          />
        ))}
        {draft && (
          <p className="line-clamp-4 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {draft}
          </p>
        )}
        <p
          role="status"
          aria-live="polite"
          className="motion-safe:animate-pulse motion-reduce:animate-none"
        >
          {stopping
            ? copy("Останавливаю запрос…")
            : copy(progress?.label ?? "Подключаюсь…")}
        </p>
      </div>
    );
  }
  if (!activity.length && !draft && !summary) {
    return null;
  }
  return (
    <details className="group/work text-xs leading-5 text-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 transition-transform group-open/work:rotate-90 motion-reduce:transition-none" />
        <span>
          {copy("Ход работы")}
          {summary && ` · ${seconds} ${copy("с")}`}
        </span>
      </summary>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto border-l pl-3">
        {activity.map((entry, index) =>
          entry.kind === "status" ? (
            <p key={index}>{copy(entry.text)}</p>
          ) : (
            <AssistantMessageContent
              key={index}
              content={entry.text}
              compact
            />
          ),
        )}
        {draft && (
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {draft}
          </p>
        )}
        {summary && (
          <div className="border-t pt-3">
            <AssistantUsageSummary summary={summary} />
          </div>
        )}
      </div>
    </details>
  );
}
