"use client";

import { parseTags } from "@asmblyr-collaborative/contracts";
import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";

export function TagsValue({
  value,
  limit,
}: {
  value: unknown;
  limit?: number;
}) {
  const copy = useUiCopy();
  let tags: string[];
  try {
    tags = value == null ? [] : parseTags(value);
  } catch {
    const text = JSON.stringify(value) ?? "—";
    return (
      <span
        className="block truncate text-sm"
        title={text}
      >
        {text}
      </span>
    );
  }
  if (!tags.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  const visible = limit === undefined ? tags : tags.slice(0, limit);
  const remaining = tags.slice(visible.length);
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${limit === undefined ? "flex-wrap" : "overflow-hidden"}`}
    >
      {visible.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          title={tag}
          className={`min-w-0 font-normal ${limit === undefined ? "max-w-full" : "max-w-32"}`}
        >
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
      {remaining.length > 0 && (
        <Badge
          variant="outline"
          className="shrink-0 font-normal text-muted-foreground"
          title={remaining.join(", ")}
          aria-label={copy("Ещё тегов: {{value0}}", {
            value0: remaining.length,
          })}
        >
          +{remaining.length}
        </Badge>
      )}
    </div>
  );
}
