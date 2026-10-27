"use client";

import type { ReactNode } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { PopoverTrigger } from "@/components/ui/popover";
import { useUiCopy } from "@/lib/ui-copy";

export function RecordChooserTrigger({
  id,
  collectionName,
  label,
  fieldLabel,
  selected,
  disabled,
  trigger,
  onClear,
}: {
  id?: string;
  collectionName: string;
  label: string;
  fieldLabel: string;
  selected: boolean;
  disabled?: boolean;
  trigger?: ReactNode;
  onClear?: () => void;
}) {
  const copy = useUiCopy();
  const clear = Boolean(onClear && selected && !trigger);
  return (
    <div className={trigger ? "contents" : "relative min-w-0 w-full"}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          aria-label={copy("Выбрать записи: {{value0}}", {
            value0: collectionName,
          })}
          className={
            trigger
              ? "gap-2"
              : `h-9 w-full min-w-0 justify-between rounded-lg border-input bg-transparent px-2.5 py-1 text-base font-normal shadow-none hover:bg-transparent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:hover:bg-input/50 ${clear ? "pr-14" : ""}`
          }
        >
          {trigger ?? (
            <>
              <span className="truncate">{label}</span>
              <ChevronsUpDown
                className={`size-3.5 shrink-0 text-muted-foreground ${clear ? "absolute right-2.5" : ""}`}
                aria-hidden="true"
              />
            </>
          )}
        </Button>
      </PopoverTrigger>
      {clear && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          className="absolute inset-y-0 right-6 my-auto size-6 rounded-md"
          aria-label={copy("Очистить поле {{value0}}", { value0: fieldLabel })}
          onClick={onClear}
        >
          <X
            aria-hidden="true"
            className="size-3.5"
          />
        </Button>
      )}
    </div>
  );
}
