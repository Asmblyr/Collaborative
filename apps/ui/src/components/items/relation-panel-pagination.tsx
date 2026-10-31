"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationPanelPagination({
  fieldName,
  page,
  size,
  total,
  busy,
  onPageChange,
}: {
  fieldName: string;
  page: number;
  size: number;
  total: string;
  busy: boolean;
  onPageChange: (page: number) => void;
}) {
  const copy = useUiCopy();
  const totalCount = Number(total);
  const pageCount = Math.max(1, Math.ceil(totalCount / size));

  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {copy("Всего:")} {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={copy("Предыдущая страница {{value0}}", {
            value0: fieldName,
          })}
          disabled={busy || page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-xs tabular-nums">
          {page} / {pageCount}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={copy("Следующая страница {{value0}}", {
            value0: fieldName,
          })}
          disabled={busy || page * size >= totalCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
