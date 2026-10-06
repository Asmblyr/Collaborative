"use client";

import { useState } from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import type {
  PermissionCondition,
  PermissionFilter,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fieldOperators,
  hasMultipleValues,
  hasNoValue,
  operatorLabels,
  type FilterField,
} from "../items/item-filter-options";
import { newPermissionCondition } from "./policy-condition-model";
import { PolicyValuePicker } from "./policy-condition-pickers";
import { PolicyFieldPicker } from "./policy-field-picker";
import { useUiCopy } from "@/lib/ui-copy";

export function PolicyConditionGroup({
  value,
  fields,
  onChange,
  depth = 1,
}: {
  value: PermissionFilter;
  fields: FilterField[];
  onChange: (value: PermissionFilter) => void;
  depth?: number;
}) {
  const copy = useUiCopy();

  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  function replace(
    index: number,
    child: PermissionCondition | PermissionFilter,
  ) {
    onChange({
      ...value,
      children: value.children.map((current, position) =>
        position === index ? child : current,
      ),
    });
  }
  function remove(index: number) {
    onChange({
      ...value,
      children: value.children.filter((_child, position) => position !== index),
    });
  }
  return (
    <div className={depth > 1 ? "rounded-lg border bg-muted/10 px-3 py-4" : ""}>
      <div className="mb-3 flex items-center justify-between">
        <Select
          value={value.logic}
          onValueChange={(logic) =>
            onChange({ ...value, logic: logic as "and" | "or" })
          }
        >
          <SelectTrigger
            aria-label={copy("Связь условий группы {{value0}}", {
              value0: depth,
            })}
            size="sm"
            className="w-auto gap-2 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none dark:bg-transparent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">{copy("Все условия · И")}</SelectItem>
            <SelectItem value="or">{copy("Любое условие · ИЛИ")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border-t">
        {value.children.map((child, index) => {
          if ("logic" in child)
            return (
              <div
                key={index}
                className="relative border-b py-2 pr-9"
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="absolute right-0 top-4"
                  aria-label={copy("Удалить группу")}
                  onClick={() => remove(index)}
                >
                  <X className="size-4" />
                </Button>
                <PolicyConditionGroup
                  value={child}
                  fields={fields}
                  depth={depth + 1}
                  onChange={(group) => replace(index, group)}
                />
              </div>
            );
          const field =
            fields.find((entry) => entry.name === child.field) ?? fields[0];
          return (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-2 border-b py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)_minmax(0,1.75fr)_1.75rem]"
            >
              <div className="col-start-1 flex min-w-0">
                <PolicyFieldPicker
                  fields={fields}
                  value={child.field}
                  onChange={(next) =>
                    replace(index, {
                      field: next.name,
                      op: "eq",
                      value: {
                        kind: "literal",
                        value:
                          next.options?.[0]?.value ??
                          (next.type === "boolean" ? "true" : ""),
                      },
                    })
                  }
                />
              </div>
              <Select
                value={child.op}
                onValueChange={(op) =>
                  replace(index, {
                    field: child.field,
                    op: op as PermissionCondition["op"],
                    ...(!hasNoValue(op)
                      ? {
                          value: {
                            kind: "literal",
                            value: hasMultipleValues(op)
                              ? [
                                  "",
                                  ...(op === "between" || op === "notBetween"
                                    ? [""]
                                    : []),
                                ]
                              : "",
                          } as const,
                        }
                      : {}),
                  })
                }
              >
                <SelectTrigger
                  aria-label={copy("Оператор для {{value0}}", {
                    value0: field.label,
                  })}
                  size="sm"
                  className="col-start-1 min-h-7 w-full min-w-0 py-0 shadow-none sm:col-start-auto"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldOperators(field)
                    .filter((op) => !["exists", "notExists"].includes(op))
                    .map((op) => (
                      <SelectItem
                        key={op}
                        value={op}
                      >
                        {copy(operatorLabels[op])}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="col-start-1 flex min-w-0 sm:col-start-auto">
                {!hasNoValue(child.op) && (
                  <PolicyValuePicker
                    key={`${child.field}:${child.op}`}
                    field={field}
                    condition={child}
                    onChange={(operand) =>
                      replace(index, { ...child, value: operand })
                    }
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                aria-label={copy("Удалить условие {{value0}}", {
                  value0: index + 1,
                })}
                onClick={() => remove(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      {!value.children.length && (
        <p className="py-5 text-sm text-muted-foreground">
          {copy("Добавьте хотя бы одно условие. ")}
        </p>
      )}
      <div className="flex items-center gap-0.5 py-3">
        <Button
          type="button"
          variant="ghost"
          className="gap-2 px-1 text-sm font-normal"
          disabled={value.children.length >= 20}
          onClick={() =>
            onChange({
              ...value,
              children: [...value.children, newPermissionCondition(fields)],
            })
          }
        >
          <Plus className="size-4" />
          {copy("Добавить условие ")}
        </Button>
        {depth < 3 && (
          <Popover
            open={groupMenuOpen}
            onOpenChange={setGroupMenuOpen}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy("Дополнительные действия с условиями")}
              >
                <ChevronDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-52 p-1"
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                setGroupMenuOpen(false);
              }}
            >
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start text-sm font-normal"
                disabled={value.children.length >= 20}
                onClick={() => {
                  setGroupMenuOpen(false);
                  onChange({
                    ...value,
                    children: [
                      ...value.children,
                      {
                        logic: "or",
                        children: [newPermissionCondition(fields)],
                      },
                    ],
                  });
                }}
              >
                {copy("Добавить группу И/ИЛИ ")}
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
