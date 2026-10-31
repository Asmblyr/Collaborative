"use client";

import { Plus } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type {
  RepeaterField,
  RepeaterSettings as Settings,
} from "@/components/items/presentation-types";
import { RepeaterFieldCard } from "./repeater-field-card";
import { useUiCopy } from "@/lib/ui-copy";

export const defaultRepeater: Settings = {
  fields: [
    {
      name: "value",
      label: "Значение",
      type: "text",
      interface: "auto",
      required: false,
      width: "full",
    },
  ],
  labelField: "value",
  minItems: 0,
  maxItems: 50,
};

export function RepeaterSettings({
  value,
  disabled,
  container,
  onChange,
}: {
  value: Settings;
  disabled: boolean;
  container?: HTMLElement | null;
  onChange: (value: Settings) => void;
}) {
  const copy = useUiCopy();

  const setField = (index: number, field: RepeaterField) =>
    onChange({
      ...value,
      fields: value.fields.map((current, position) =>
        position === index ? field : current,
      ),
      labelField:
        value.labelField === value.fields[index].name
          ? field.name || null
          : value.labelField,
    });

  const move = (index: number, offset: number) => {
    const fields = [...value.fields];
    [fields[index], fields[index + offset]] = [
      fields[index + offset],
      fields[index],
    ];
    onChange({ ...value, fields });
  };

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="text-sm font-medium">{copy("Поля каждого элемента")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy(
            "Список хранится в одном JSON-поле. Изменение настройки не переписывает существующие данные.",
          )}
        </p>
      </div>
      {value.fields.map((field, index) => (
        <RepeaterFieldCard
          key={index}
          field={field}
          index={index}
          total={value.fields.length}
          disabled={disabled}
          container={container}
          onChange={(nextField) => setField(index, nextField)}
          onMove={(offset) => move(index, offset)}
          onRemove={() =>
            onChange({
              ...value,
              fields: value.fields.filter((_, position) => position !== index),
              labelField:
                value.labelField === field.name ? null : value.labelField,
            })
          }
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || value.fields.length >= 24}
        onClick={() => {
          let name = "field";
          let index = 1;
          while (value.fields.some((entry) => entry.name === name)) {
            name = `field_${index}`;
            index += 1;
          }
          onChange({
            ...value,
            fields: [
              ...value.fields,
              { ...defaultRepeater.fields[0], name, label: "" },
            ],
          });
        }}
      >
        <Plus />
        {copy("Поле элемента")}
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs">
          {copy("Минимум элементов")}
          <Input
            type="number"
            min={0}
            max={200}
            value={value.minItems}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                minItems: Number.isNaN(event.target.valueAsNumber)
                  ? 0
                  : event.target.valueAsNumber,
              })
            }
          />
        </label>
        <label className="space-y-1 text-xs">
          {copy("Максимум элементов")}
          <Input
            type="number"
            min={1}
            max={200}
            value={value.maxItems}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                maxItems: Number.isNaN(event.target.valueAsNumber)
                  ? 1
                  : event.target.valueAsNumber,
              })
            }
          />
        </label>
      </div>
      <Select
        value={value.labelField || "$none"}
        disabled={disabled}
        onValueChange={(selected) =>
          onChange({
            ...value,
            labelField: selected === "$none" ? null : selected,
          })
        }
      >
        <SelectTrigger
          aria-label={copy("Заголовок элемента")}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="$none">
            {copy("Заголовок: номер элемента")}
          </SelectItem>
          {value.fields
            .filter(
              (entry, position, all) =>
                entry.name &&
                all.findIndex((candidate) => candidate.name === entry.name) ===
                  position,
            )
            .map((entry) => (
              <SelectItem
                key={entry.name}
                value={entry.name}
              >
                {entry.label || entry.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </section>
  );
}
