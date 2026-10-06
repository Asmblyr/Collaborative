"use client";

import { ArrowRightLeft } from "lucide-react";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantContextBoundary({ label }: { label?: string }) {
  const copy = useUiCopy();
  const title = label || copy("Контекст изменён");

  return (
    <div
      role="separator"
      aria-label={copy("Контекст: {{value0}}", { value0: title })}
      className="mb-4 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
    >
      <span className="h-px min-w-3 flex-1 bg-border" />
      <ArrowRightLeft
        className="size-3 shrink-0"
        aria-hidden="true"
      />
      <span
        className="max-w-[80%] truncate"
        title={title}
      >
        {title}
      </span>
      <span className="h-px min-w-3 flex-1 bg-border" />
    </div>
  );
}
