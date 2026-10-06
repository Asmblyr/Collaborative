"use client";

import { useState } from "react";
import { CaseSensitive, Check, ChevronDown } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fieldOperators,
  operatorLabels,
  type FilterField,
} from "./item-filter-options";
import { ItemFilterMenu } from "./item-filter-menu";
import { useUiCopy } from "@/lib/ui-copy";

const dateLabels: Record<string, string> = {
  gt: "Позже",
  gte: "Не раньше",
  lt: "Раньше",
  lte: "Не позже",
  between: "В период",
  notBetween: "Вне периода",
};

export function ItemFilterOperator({
  field,
  value,
  presence = false,
  onChange,
}: {
  field: FilterField;
  value: string;
  presence?: boolean;
  onChange: (operator: string) => void;
}) {
  const copy = useUiCopy();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const sensitive = value.endsWith("Case");
  const base = sensitive ? value.slice(0, -4) : value;
  const available = presence ? ["exists", "notExists"] : fieldOperators(field);
  const label = (op: string) => {
    const dateLabel = field.type === "datetime" ? dateLabels[op] : undefined;
    return copy(dateLabel ?? operatorLabels[op] ?? op).replace(
      / \((?:без регистра|точный регистр|case insensitive|case sensitive)\)$/,
      "",
    );
  };
  const options = available.filter(
    (op) =>
      !op.endsWith("Case") &&
      label(op).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const supportsCase = available.includes(base + "Case");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={copy("Оператор фильтра")}
          className="h-8 min-w-0 max-w-full gap-1 rounded-md px-2 font-normal text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{label(base).toLocaleLowerCase()}</span>
          {sensitive && (
            <CaseSensitive
              aria-label={copy("С учётом регистра")}
              className="size-3.5"
            />
          )}
          <ChevronDown
            aria-hidden="true"
            className="size-3 opacity-50"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={5}
        className="w-64 p-0"
      >
        <ItemFilterMenu
          query={query}
          onQueryChange={setQuery}
          placeholder={copy("Найти оператор…")}
        >
          {options.map((op) => (
            <Button
              key={op}
              type="button"
              size="sm"
              variant="ghost"
              className="w-full justify-between font-normal"
              onClick={() => {
                onChange(
                  sensitive && available.includes(op + "Case")
                    ? op + "Case"
                    : op,
                );
                setOpen(false);
              }}
            >
              <span>{label(op)}</span>
              {base === op && (
                <Check
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
              )}
            </Button>
          ))}
          {options.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              {copy("Оператор не найден ")}
            </p>
          )}
        </ItemFilterMenu>
        {supportsCase && (
          <label className="flex cursor-pointer items-center gap-2 border-t px-3 py-3 text-xs">
            <Checkbox
              checked={sensitive}
              onCheckedChange={(checked) =>
                onChange(checked ? base + "Case" : base)
              }
            />
            {copy("Учитывать регистр букв ")}
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
}
