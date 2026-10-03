import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
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
  const many = isManyRelation(scope);
  const options = many
    ? [
        ["eq", "Включает запись"],
        ["neq", "Не включает запись"],
        ["in", "Включает любую из"],
        ["notIn", "Не включает ни одну из"],
        ["exists", "Есть связи"],
        ["notExists", "Нет связей"],
      ]
    : [
        ["eq", "Равно"],
        ["neq", "Не равно"],
        ["in", "Одна из"],
        ["notIn", "Ни одна из"],
        ...(field.nullable
          ? [
              ["isNull", "Не задана"],
              ["notNull", "Задана"],
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
        aria-label="Условие для связи"
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
