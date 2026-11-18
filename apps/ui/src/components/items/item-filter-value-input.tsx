"use client";

import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type { FilterField } from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export function localDatetimeValue(value: string): string {
  if (!value || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
}

export function formattedFilterValue(
  value: string,
  field: FilterField,
  copy: UiCopy = originalCopy,
): string {
  if (field.options) {
    return (
      field.options.find((option) => option.value === value)?.label ?? value
    );
  }
  if (field.type === "boolean") {
    return value === "true"
      ? copy("Да")
      : value === "false"
        ? copy("Нет")
        : value;
  }
  if (field.type === "datetime" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      return date.toLocaleString(copy.locale === "en" ? "en-US" : "ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return value;
}

export function FilterValueInput({
  field,
  value,
  onChange,
  label,
  inline = false,
  autoFocus = false,
}: {
  field: FilterField;
  value: string;
  onChange: (value: string) => void;
  label: string;
  inline?: boolean;
  autoFocus?: boolean;
}) {
  const copy = useUiCopy();

  if (field.options?.length) {
    return (
      <Select
        value={value}
        onValueChange={onChange}
      >
        <SelectTrigger
          aria-label={label}
          className={
            inline
              ? "h-8 w-auto max-w-64 border-0 bg-transparent px-2 shadow-none"
              : "w-full"
          }
        >
          <SelectValue placeholder={copy("выберите…")} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "boolean") {
    return (
      <Select
        value={value}
        onValueChange={onChange}
      >
        <SelectTrigger
          aria-label={label}
          className={
            inline
              ? "h-8 border-0 bg-transparent px-2 shadow-none dark:bg-transparent"
              : "w-full"
          }
        >
          <SelectValue placeholder={copy("выберите…")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{copy("Да")}</SelectItem>
          <SelectItem value="false">{copy("Нет")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      autoFocus={autoFocus}
      aria-label={label}
      type={
        field.type === "date"
          ? "date"
          : field.type === "datetime"
            ? "datetime-local"
            : field.type === "integer"
              ? "number"
              : "text"
      }
      step={field.type === "datetime" ? 1 : undefined}
      maxLength={255}
      placeholder={
        field.type === "key" && field.keyType === "uuid"
          ? "UUID…"
          : copy("значение…")
      }
      className={
        inline
          ? "h-8 w-24 min-w-20 flex-1 rounded-md border-transparent bg-transparent px-2 shadow-none hover:bg-background/60 focus-visible:bg-background focus-visible:ring-2 dark:bg-transparent"
          : "w-full"
      }
      value={field.type === "datetime" ? localDatetimeValue(value) : value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
