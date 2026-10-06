"use client";

import { ArrowDownWideNarrow, Check } from "lucide-react";
import type { ItemOrder } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemSearchOrder({
  value,
  onChange,
}: {
  value: ItemOrder;
  onChange: (value: ItemOrder) => void;
}) {
  const copy = useUiCopy();
  const labels = {
    relevance: copy("По релевантности"),
    field: copy("По столбцу"),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={copy("Порядок результатов поиска")}
        >
          <ArrowDownWideNarrow aria-hidden="true" /> {labels[value]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["relevance", "field"] as const).map((order) => (
          <DropdownMenuItem
            key={order}
            onSelect={() => onChange(order)}
          >
            <span className="flex size-4 items-center justify-center">
              {value === order && (
                <Check
                  className="size-4"
                  aria-hidden="true"
                />
              )}
            </span>
            {labels[order]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
