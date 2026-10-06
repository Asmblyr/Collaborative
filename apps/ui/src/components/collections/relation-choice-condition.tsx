"use client";

import type {
  RelationChoiceFilter,
  ItemFilterOperator,
} from "@asmblyr-collaborative/contracts";
import { X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { ItemFilterFieldPicker } from "@/components/items/item-filter-field-picker";
import { ItemFilterOperator as OperatorPicker } from "@/components/items/item-filter-operator";
import { ItemFilterValue } from "@/components/items/item-filter-value";
import {
  hasNoValue,
  hasMultipleValues,
  type FilterScope,
} from "@/components/items/item-filter-options";
import type { CollectionField } from "@/components/items/types";
import { FieldSettingSelect } from "./field-setting-select";
import { useUiCopy } from "@/lib/ui-copy";

type Condition = Exclude<
  RelationChoiceFilter["children"][number],
  RelationChoiceFilter
>;
export function RelationChoiceCondition({
  condition,
  scopes,
  dependencies,
  container,
  onChange,
  onRemove,
}: {
  condition: Condition;
  scopes: FilterScope[];
  dependencies: CollectionField[];
  container?: HTMLElement | null;
  onChange(value: Condition): void;
  onRemove(): void;
}) {
  const copy = useUiCopy();

  const field = scopes
    .flatMap((s) => s.fields)
    .find((f) => f.name === condition.field);
  const many = field?.relationKind === "m2m" || field?.relationKind === "o2m";
  const literal =
    condition.value?.kind === "literal" ? condition.value.value : "";
  const plain = {
    ...condition,
    value: Array.isArray(literal) ? literal.map(String) : String(literal),
  };
  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="flex flex-wrap items-center gap-1">
        <ItemFilterFieldPicker
          scopes={scopes}
          condition={plain}
          onSelect={(c) =>
            onChange({
              ...c,
              op: c.op as ItemFilterOperator,
              value:
                c.value === undefined
                  ? undefined
                  : { kind: "literal", value: c.value },
            })
          }
        />
        {field && (
          <OperatorPicker
            field={field}
            value={condition.op}
            onChange={(op) =>
              onChange({
                ...condition,
                op: op as ItemFilterOperator,
                value: hasNoValue(op)
                  ? undefined
                  : {
                      kind: "literal",
                      value: hasMultipleValues(op) ? [""] : "",
                    },
              })
            }
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-7"
          aria-label={copy("Удалить ограничение выбора")}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      {many && (
        <FieldSettingSelect
          label={copy("Совпадение связанных записей")}
          value={condition.quantifier ?? "some"}
          container={container}
          options={[
            { value: "some", label: copy("Есть связанная запись") },
            { value: "none", label: copy("Нет связанной записи") },
          ]}
          onChange={(quantifier) =>
            onChange({
              ...condition,
              quantifier: quantifier as "some" | "none",
            })
          }
        />
      )}
      {!hasNoValue(condition.op) && field && (
        <div className="grid gap-2 sm:grid-cols-2">
          <FieldSettingSelect
            label={copy("Источник значения")}
            value={
              condition.value?.kind === "field"
                ? condition.value.field
                : "$literal"
            }
            container={container}
            options={[
              { value: "$literal", label: copy("Заданное значение") },
              ...(!hasMultipleValues(condition.op)
                ? dependencies.map((f) => ({
                    value: f.name,
                    label: copy("Из формы: {{value0}}", {
                      value0: f.presentation?.label || f.name,
                    }),
                  }))
                : []),
            ]}
            onChange={(source) =>
              onChange({
                ...condition,
                value:
                  source === "$literal"
                    ? {
                        kind: "literal",
                        value: hasMultipleValues(condition.op) ? [""] : "",
                      }
                    : { kind: "field", field: source },
              })
            }
          />
          {condition.value?.kind !== "field" && (
            <ItemFilterValue
              condition={plain}
              field={field}
              onChange={(value) =>
                onChange({ ...condition, value: { kind: "literal", value } })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
