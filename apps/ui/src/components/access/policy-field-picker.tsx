"use client";
import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterField } from "../items/item-filter-options";
import { PolicyPickerTrigger } from "./policy-picker-trigger";
import { useUiCopy } from "@/lib/ui-copy";

export function PolicyFieldPicker({
  fields,
  value,
  onChange,
}: {
  fields: FilterField[];
  value: string;
  onChange: (field: FilterField) => void;
}) {
  const copy = useUiCopy();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <PolicyPickerTrigger aria-label={copy("Поле условия")}>
          <span className="truncate">
            {fields.find((field) => field.name === value)?.label ?? value}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </PolicyPickerTrigger>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <Input
          aria-label={copy("Найти поле")}
          placeholder={copy("Найти поле…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-2 max-h-64 overflow-auto">
          {fields
            .filter((field) =>
              `${field.label} ${field.name}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((field) => (
              <Button
                key={field.name}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between text-left text-sm font-normal"
                title={field.name}
                onClick={() => {
                  onChange(field);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="truncate">{field.label}</span>
                {field.name === value && <Check className="size-4 shrink-0" />}
              </Button>
            ))}
          {!fields.some((field) =>
            `${field.label} ${field.name}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) && (
            <p className="p-3 text-sm text-muted-foreground">
              {copy("Поля не найдены")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
