"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type {
  FilterCondition,
  FilterField,
  FilterScope,
} from "./item-filter-options";
import {
  changeRelationSelectionOperator,
  isManyRelation,
  relationSelectionOperator,
} from "./item-filter-relation";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFilterRelationOperator({
  condition,
  scope,
  field,
  onChange,
}: {
  condition: FilterCondition;
  scope: FilterScope;
  field: FilterField;
  onChange: (condition: FilterCondition) => void;
}) {
  const copy = useUiCopy();

  const many = isManyRelation(scope);
  const options = many
    ? [
        ["eq", copy("Включает запись")],
        ["neq", copy("Не включает запись")],
        ["in", copy("Включает любую из")],
        ["notIn", copy("Не включает ни одну из")],
        ["exists", copy("Есть связи")],
        ["notExists", copy("Нет связей")],
      ]
    : [
        ["eq", copy("Равно")],
        ["neq", copy("Не равно")],
        ["in", copy("Одна из")],
        ["notIn", copy("Ни одна из")],
        ...(field.nullable
          ? [
              ["isNull", copy("Не задана")],
              ["notNull", copy("Задана")],
            ]
          : []),
      ];
  return (
    <Select
      value={relationSelectionOperator(condition, scope)}
      onValueChange={(op) =>
        onChange(changeRelationSelectionOperator(condition, scope, op))
      }
    >
      <SelectTrigger
        aria-label={copy("Условие для связи")}
        size="sm"
        className="h-8 min-w-0 max-w-full gap-1 border-0 bg-transparent px-2 font-normal text-muted-foreground shadow-none dark:bg-transparent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([value, label]) => (
          <SelectItem
            key={value}
            value={value}
          >
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
