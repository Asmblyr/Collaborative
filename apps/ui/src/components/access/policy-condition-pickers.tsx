"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  UserRound,
  Search,
} from "lucide-react";
import {
  permissionContextParameters,
  type PermissionCondition,
  type PermissionOperand,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  hasMultipleValues,
  type FilterField,
} from "../items/item-filter-options";
import { compatibleParameters } from "./policy-condition-model";
import { PolicyPickerTrigger } from "./policy-picker-trigger";
import { useUiCopy } from "@/lib/ui-copy";

export function PolicyValuePicker({
  field,
  condition,
  onChange,
}: {
  field: FilterField;
  condition: PermissionCondition;
  onChange: (value: PermissionOperand) => void;
}) {
  const copy = useUiCopy();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"quick" | "parameters" | "literal">("quick");
  const [query, setQuery] = useState("");
  const [literal, setLiteral] = useState("");
  const operand = condition.value;
  const multiple = hasMultipleValues(condition.op);
  const parameters = compatibleParameters(field, condition.op).map(
    (parameter) => ({
      ...parameter,
      label: copy(parameter.label),
      description: copy(parameter.description),
    }),
  );
  const current =
    operand?.kind === "context"
      ? permissionContextParameters.find((entry) => entry.path === operand.path)
      : undefined;
  const rawValue =
    operand?.kind === "literal"
      ? Array.isArray(operand.value)
        ? operand.value.join(", ")
        : operand.value
      : "";
  const label =
    (current ? copy(current.label) : undefined) ??
    field.options?.find((entry) => entry.value === rawValue)?.label ??
    (field.type === "boolean" && rawValue
      ? rawValue === "true"
        ? copy("Да")
        : copy("Нет")
      : rawValue);
  const options =
    field.type === "boolean"
      ? [
          { value: "true", label: copy("Да") },
          { value: "false", label: copy("Нет") },
        ]
      : ["eq", "neq"].includes(condition.op)
        ? (field.options ?? [])
        : [];
  function choose(value: PermissionOperand) {
    onChange(value);
    setOpen(false);
    setMode("quick");
    setQuery("");
  }
  function changeOpen(value: boolean) {
    setOpen(value);
    if (value) {
      setMode("quick");
      setQuery("");
      const date = new Date(rawValue);
      setLiteral(
        field.type === "datetime" && !multiple && !Number.isNaN(date.getTime())
          ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
              .toISOString()
              .slice(0, 23)
          : rawValue,
      );
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={changeOpen}
    >
      <PopoverTrigger asChild>
        <PolicyPickerTrigger
          aria-label={copy("Значение для {{value0}}", { value0: field.label })}
          title={
            current ? `${copy(current.description)} ${current.path}` : rawValue
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            {current && <UserRound className="size-4 shrink-0 text-primary" />}
            <span
              className={`truncate ${!label ? "text-muted-foreground" : ""}`}
            >
              {label || copy("Выберите значение…")}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </PolicyPickerTrigger>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-2"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        {mode === "literal" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {copy("Значение для ")}
              {field.label}
            </p>
            <Input
              autoFocus
              aria-label={copy("Значение условия")}
              maxLength={multiple ? 1024 : 255}
              type={
                field.type === "datetime" && !multiple
                  ? "datetime-local"
                  : "text"
              }
              step="any"
              placeholder={
                multiple
                  ? copy("Значения через запятую")
                  : copy("Введите значение…")
              }
              value={literal}
              onChange={(event) => setLiteral(event.target.value)}
            />
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("quick")}
              >
                {copy("Назад ")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const parsed =
                    field.type === "datetime" &&
                    !multiple &&
                    literal &&
                    !Number.isNaN(Date.parse(literal))
                      ? new Date(literal).toISOString()
                      : literal;
                  choose({
                    kind: "literal",
                    value: multiple
                      ? literal.split(",").map((value) => value.trim())
                      : parsed,
                  });
                }}
              >
                {copy("Выбрать ")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-2 size-4 text-muted-foreground" />
              <Input
                aria-label={copy("Найти параметр")}
                placeholder={copy("Найти параметр…")}
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="my-2 max-h-64 overflow-auto">
              {mode === "quick" &&
                options
                  .filter((entry) =>
                    entry.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((entry) => (
                    <Button
                      key={entry.value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-sm font-normal"
                      onClick={() =>
                        choose({ kind: "literal", value: entry.value })
                      }
                    >
                      {entry.label}
                      {rawValue === entry.value && <Check className="size-4" />}
                    </Button>
                  ))}
              {parameters
                .filter(
                  (parameter, index) =>
                    (mode === "parameters" || query || index === 0) &&
                    `${parameter.label} ${parameter.path} ${parameter.description}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((parameter) => (
                  <Button
                    key={parameter.path}
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={`${parameter.description} ${parameter.path} · ${parameter.type}`}
                    className="w-full justify-start gap-2 text-left text-sm font-normal"
                    onClick={() =>
                      choose({ kind: "context", path: parameter.path })
                    }
                  >
                    <UserRound className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      {parameter.label}
                    </span>
                    {current?.path === parameter.path && (
                      <Check className="size-4 text-primary" />
                    )}
                  </Button>
                ))}
              {query &&
                !parameters.some((parameter) =>
                  `${parameter.label} ${parameter.path} ${parameter.description}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) &&
                !options.some((entry) =>
                  entry.label.toLowerCase().includes(query.toLowerCase()),
                ) && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    {copy("Подходящих параметров нет ")}
                  </p>
                )}
            </div>
            <div className="border-t pt-1">
              {mode === "quick" && parameters.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-sm font-normal"
                  onClick={() => setMode("parameters")}
                >
                  {copy("Все параметры… ")}
                  <ChevronRight className="size-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm font-normal"
                onClick={() => setMode("literal")}
              >
                {copy("Задать значение… ")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
