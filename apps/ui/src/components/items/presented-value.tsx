"use client";

import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";
import { formattedValue } from "./value-format";
import type { ValueDisplay } from "./presentation-types";

export const statusColors = {
  gray: "bg-muted text-muted-foreground border-border",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  green:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  amber:
    "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
  red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  violet:
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
};

export function PresentedValue({
  value,
  display,
}: {
  value: unknown;
  display: ValueDisplay;
}) {
  const copy = useUiCopy();
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (display.kind === "status") {
    const status = display.statuses.find((s) => s.value === String(value));
    return (
      <Badge
        variant="outline"
        className={statusColors[status?.color ?? "gray"]}
      >
        {status?.label ?? String(value)}
      </Badge>
    );
  }
  const text = formattedValue(value, display, copy.locale) ?? String(value);
  return (
    <span
      title={text}
      className="block truncate text-sm tabular-nums"
    >
      {text}
    </span>
  );
}
