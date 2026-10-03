"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { FormCondition } from "@/components/items/presentation-types";
import type { CollectionField } from "@/components/items/types";

export function FormConditionSettings({
  value,
  fields,
  disabled,
  container,
  onChange,
}: {
  value?: FormCondition;
  fields: CollectionField[];
  disabled: boolean;
  container: HTMLElement | null;
  onChange: (condition?: FormCondition) => void;
}) {
  const eligible = fields.filter((f) =>
    [
      "text",
      "email",
      "integer",
      "decimal",
      "boolean",
      "datetime",
      "relation",
    ].includes(f.type),
  );
  const newRule = (): FormCondition["rules"][number] => ({
    field: eligible[0]?.name ?? "",
    operator: "eq",
    value: "",
  });
  const setRule = (index: number, next: FormCondition["rules"][number]) =>
    onChange({
      ...value!,
      rules: value!.rules.map((r, i) => (i === index ? next : r)),
    });
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Когда показывать</h3>
        <p className="text-xs text-muted-foreground">
          Скрытые значения сохраняются. Это настройка формы, обязательность и
          права остаются в силе.
        </p>
      </div>
      <Select
        value={value?.mode ?? "always"}
        disabled={disabled}
        onValueChange={(v) =>
          onChange(
            v === "always"
              ? undefined
              : {
                  mode: v as "all" | "any",
                  rules: value?.rules ?? [newRule()],
                },
          )
        }
      >
        <SelectTrigger
          aria-label="Условия видимости"
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="always">Всегда</SelectItem>
          <SelectItem
            value="all"
            disabled={!eligible.length}
          >
            Все условия выполнены
          </SelectItem>
          <SelectItem
            value="any"
            disabled={!eligible.length}
          >
            Любое условие выполнено
          </SelectItem>
        </SelectContent>
      </Select>
      {value?.rules.map((rule, index) => {
        const field = eligible.find((f) => f.name === rule.field);
        return (
          <div
            key={index}
            className="space-y-2 rounded-lg border p-3"
          >
            <div className="flex gap-2">
              <Select
                value={rule.field}
                disabled={disabled}
                onValueChange={(field) =>
                  setRule(index, { field, operator: "eq", value: "" })
                }
              >
                <SelectTrigger
                  aria-label={`Поле условия ${index + 1}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={container}>
                  {eligible.map((f) => (
                    <SelectItem
                      key={f.name}
                      value={f.name}
                    >
                      {f.presentation?.label || f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Удалить условие ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange(
                    value.rules.length === 1
                      ? undefined
                      : {
                          ...value,
                          rules: value.rules.filter((_, i) => i !== index),
                        },
                  )
                }
              >
                <X />
              </Button>
            </div>
            <Select
              value={rule.operator}
              disabled={disabled}
              onValueChange={(operator) =>
                setRule(index, {
                  field: rule.field,
                  operator: operator as typeof rule.operator,
                  ...(["eq", "ne"].includes(operator)
                    ? { value: rule.value ?? "" }
                    : {}),
                })
              }
            >
              <SelectTrigger
                aria-label={`Оператор условия ${index + 1}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="eq">Равно</SelectItem>
                <SelectItem value="ne">Не равно</SelectItem>
                <SelectItem value="empty">Не заполнено</SelectItem>
                <SelectItem value="notEmpty">Заполнено</SelectItem>
              </SelectContent>
            </Select>
            {["eq", "ne"].includes(rule.operator) &&
              (field?.type === "boolean" ? (
                <Select
                  value={String(rule.value)}
                  disabled={disabled}
                  onValueChange={(v) =>
                    setRule(index, { ...rule, value: v === "true" })
                  }
                >
                  <SelectTrigger
                    aria-label={`Значение условия ${index + 1}`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Выберите значение" />
                  </SelectTrigger>
                  <SelectContent container={container}>
                    <SelectItem value="true">Да</SelectItem>
                    <SelectItem value="false">Нет</SelectItem>
                  </SelectContent>
                </Select>
              ) : field?.presentation?.options ? (
                <Select
                  value={String(rule.value ?? "")}
                  disabled={disabled}
                  onValueChange={(v) => setRule(index, { ...rule, value: v })}
                >
                  <SelectTrigger
                    aria-label={`Значение условия ${index + 1}`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Выберите значение" />
                  </SelectTrigger>
                  <SelectContent container={container}>
                    {rule.value !== undefined &&
                      String(rule.value) !== "" &&
                      !field.presentation.options.some(
                        (o) => o.value === rule.value,
                      ) && (
                        <SelectItem value={String(rule.value)}>
                          {String(rule.value)} (архивный вариант)
                        </SelectItem>
                      )}
                    {field.presentation.options.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  aria-label={`Значение условия ${index + 1}`}
                  placeholder="Значение"
                  maxLength={500}
                  value={String(rule.value ?? "")}
                  disabled={disabled}
                  onChange={(e) =>
                    setRule(index, { ...rule, value: e.target.value })
                  }
                />
              ))}
          </div>
        );
      })}
      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.rules.length >= 12}
          onClick={() =>
            onChange({ ...value, rules: [...value.rules, newRule()] })
          }
        >
          <Plus />
          Условие
        </Button>
      )}
    </section>
  );
}
