"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { ItemFilterFieldPicker } from "./item-filter-field-picker";
import { ItemFilterOperator } from "./item-filter-operator";
import { changeFilterOperator } from "./item-filter-model";
import {
  hasNoValue,
  type FilterCondition,
  type FilterScope,
} from "./item-filter-options";
import {
  presenceForCondition,
  scopeForCondition,
} from "./item-filter-presence";
import { ItemFilterValue } from "./item-filter-value";
import { relationSelectionScope } from "./item-filter-relation";
import { ItemFilterRelationOperator } from "./item-filter-relation-operator";
import { ItemFilterRelationValue } from "./item-filter-relation-value";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFilterCondition({
  condition,
  scopes,
  autoFocus,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  scopes: FilterScope[];
  autoFocus: boolean;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
}) {
  const copy = useUiCopy();

  const row = useRef<HTMLDivElement>(null);
  const scope = scopeForCondition(scopes, condition);
  const presence = presenceForCondition(scope, condition);
  const field = scopes
    .flatMap((entry) => entry.fields)
    .find((entry) => entry.name === condition.field);
  const selectionScope = relationSelectionScope(scopes, condition);
  const many =
    !selectionScope &&
    presence === null &&
    (scope.kind === "o2m" || scope.kind === "m2m");

  return (
    <div
      ref={row}
      role="group"
      aria-label={copy("Условие ") + condition.field}
      className="group flex items-start gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-1 transition-colors focus-within:border-ring/50 focus-within:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        {many && (
          <Select
            value={condition.quantifier ?? "some"}
            onValueChange={(quantifier) =>
              onChange({
                ...condition,
                quantifier: quantifier as "some" | "none",
              })
            }
          >
            <SelectTrigger
              aria-label={copy("Совпадение связанных записей")}
              size="sm"
              className="mb-0.5 h-6 max-w-full border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none dark:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="some">
                {copy("Есть связанная запись, где")}
              </SelectItem>
              <SelectItem value="none">
                {copy("Нет связанных записей, где")}
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1">
          <ItemFilterFieldPicker
            scopes={scopes}
            condition={condition}
            onSelect={(next) => {
              onChange(next);
              requestAnimationFrame(() =>
                row.current?.querySelector<HTMLInputElement>("input")?.focus(),
              );
            }}
          />
          {field && selectionScope ? (
            <>
              <ItemFilterRelationOperator
                condition={condition}
                scope={selectionScope}
                field={field}
                onChange={onChange}
              />
              {!hasNoValue(condition.op) && (
                <ItemFilterRelationValue
                  key={condition.field + ":" + condition.op}
                  scope={selectionScope}
                  condition={condition}
                  autoFocus={autoFocus}
                  onChange={(value) => onChange({ ...condition, value })}
                />
              )}
            </>
          ) : field ? (
            <>
              <ItemFilterOperator
                field={field}
                value={condition.op}
                presence={presence !== null}
                onChange={(op) => onChange(changeFilterOperator(condition, op))}
              />
              <ItemFilterValue
                key={condition.field + ":" + condition.op}
                condition={condition}
                field={field}
                autoFocus={autoFocus}
                onChange={(value) => onChange({ ...condition, value })}
              />
            </>
          ) : (
            <span className="px-2 text-xs text-destructive">
              {copy("Поле недоступно ")}
            </span>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={copy("Удалить условие ") + condition.field}
        className="h-8 w-7 shrink-0 text-muted-foreground/60 hover:text-destructive"
        onClick={onRemove}
      >
        <X
          aria-hidden="true"
          className="size-3.5"
        />
      </Button>
    </div>
  );
}
