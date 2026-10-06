"use client";

import { useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import {
  hasMultipleValues,
  hasNoValue,
  type FilterCondition,
  type FilterField,
} from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

function localDatetimeValue(value: string): string {
  if (!value || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
}

function formattedValue(
  value: string,
  field: FilterField,
  copy: UiCopy = originalCopy,
): string {
  if (field.options)
    return (
      field.options.find((option) => option.value === value)?.label ?? value
    );
  if (field.type === "boolean")
    return value === "true"
      ? copy("Да")
      : value === "false"
        ? copy("Нет")
        : value;
  if (field.type === "datetime" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf()))
      return date.toLocaleString(copy.locale === "en" ? "en-US" : "ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  }
  return value;
}

function ValueInput({
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

export function ItemFilterValue({
  condition,
  field,
  onChange,
  autoFocus = false,
}: {
  condition: FilterCondition;
  field: FilterField;
  onChange: (value: string | string[]) => void;
  autoFocus?: boolean;
}) {
  const copy = useUiCopy();

  const multiple = hasMultipleValues(condition.op);
  const range = condition.op === "between" || condition.op === "notBetween";
  const complex = multiple || field.type === "datetime";
  const [open, setOpen] = useState(autoFocus && complex);
  if (hasNoValue(condition.op)) return null;
  const scalar = typeof condition.value === "string" ? condition.value : "";
  const values = Array.isArray(condition.value) ? condition.value : [];
  const label = copy("Значение для ") + field.label;
  const choiceField = ["eq", "neq", "in", "notIn"].includes(condition.op)
    ? field
    : { ...field, options: undefined };
  if (!complex)
    return (
      <ValueInput
        field={choiceField}
        value={scalar}
        onChange={onChange}
        label={label}
        inline
        autoFocus={autoFocus}
      />
    );

  const populated = values.filter((value) => value !== "");
  const summary = range
    ? values
        .map((value) => formattedValue(value, field, copy) || "…")
        .join(" — ")
    : multiple
      ? populated
          .slice(0, 2)
          .map((value) => formattedValue(value, field, copy))
          .join(", ") +
        (populated.length > 2 ? " +" + (populated.length - 2) : "")
      : formattedValue(scalar, field, copy);
  const updateAt = (index: number, value: string) => {
    const next = range
      ? [values[0] ?? "", values[1] ?? ""]
      : values.length
        ? [...values]
        : [""];
    next[index] = value;
    onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          className={
            "h-8 min-w-0 max-w-full justify-start gap-1.5 rounded-md px-2 font-normal " +
            (!summary ? "text-muted-foreground" : "")
          }
        >
          {field.type === "datetime" && (
            <CalendarDays
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
          )}
          <span className="truncate">
            {summary ||
              (range
                ? copy("задать диапазон…")
                : multiple
                  ? copy("выбрать значения…")
                  : copy("выбрать дату…"))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={5}
        className="w-[min(22rem,calc(100vw-2rem))] p-3"
      >
        <div className="mb-3">
          <p className="text-sm font-medium">{field.label}</p>
          {multiple && !range && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copy("Каждое значение отдельно, до 20 значений. ")}
            </p>
          )}
        </div>
        {multiple && !range && field.options?.length ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {field.options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={values.includes(option.value)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...values, option.value]
                        : values.filter((value) => value !== option.value),
                    )
                  }
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        ) : range ? (
          <div className="space-y-3">
            {[copy("От"), copy("До")].map((bound, index) => (
              <label
                key={bound}
                className="block space-y-1.5 text-xs text-muted-foreground"
              >
                <span>{bound}</span>
                <ValueInput
                  field={field}
                  value={values[index] ?? ""}
                  onChange={(value) => updateAt(index, value)}
                  label={bound + ": " + field.label}
                  autoFocus={index === 0}
                />
              </label>
            ))}
          </div>
        ) : multiple ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {(values.length ? values : [""]).map((value, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5"
              >
                <ValueInput
                  field={field}
                  value={value}
                  onChange={(next) => updateAt(index, next)}
                  label={copy("Значение ") + (index + 1)}
                  autoFocus={index === Math.max(0, values.length - 1)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy("Удалить значение ") + (index + 1)}
                  disabled={values.length === 0}
                  onClick={() =>
                    onChange(values.filter((_, position) => position !== index))
                  }
                >
                  <X
                    aria-hidden="true"
                    className="size-3.5"
                  />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={values.length >= 20}
              onClick={() => onChange([...values, ""])}
            >
              <Plus aria-hidden="true" /> {copy(" Ещё значение ")}
            </Button>
          </div>
        ) : (
          <ValueInput
            field={field}
            value={scalar}
            onChange={onChange}
            label={label}
            autoFocus
          />
        )}
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button
            type="button"
            size="sm"
            onClick={() => setOpen(false)}
          >
            {copy("Готово ")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
