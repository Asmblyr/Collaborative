import type { FieldDisplayProps } from "@asmblyr-collaborative/kit/ui";
import { isHexColor } from "./color-options.ts";

export function ColorDisplay({ value }: FieldDisplayProps) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={value}
    >
      {isHexColor(value) && (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded border border-black/10 dark:border-white/20"
          style={{ backgroundColor: value }}
        />
      )}
      <span className="truncate font-mono text-xs">{value}</span>
    </span>
  );
}
