"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type {
  RepeaterField,
  RepeaterSettings as Settings,
} from "@/components/items/presentation-types";
import { FieldChoiceSettings } from "./field-choice-settings";
import { defaultPresentation } from "./field-presentation-defaults";

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
  const setField = (index: number, field: RepeaterField) =>
    onChange({
      ...value,
      fields: value.fields.map((f, i) => (i === index ? field : f)),
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
        <h3 className="text-sm font-medium">Поля каждого элемента</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Список хранится в одном JSON-поле. Изменение настройки не переписывает
          существующие данные.
        </p>
      </div>
      {value.fields.map((field, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border bg-muted/20 p-3"
        >
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs font-medium text-muted-foreground">
              Поле {index + 1}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Поднять JSON-поле ${index + 1}`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Опустить JSON-поле ${index + 1}`}
              disabled={disabled || index === value.fields.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Удалить JSON-поле ${index + 1}`}
              disabled={disabled || value.fields.length === 1}
              onClick={() =>
                onChange({
                  ...value,
                  fields: value.fields.filter((_, i) => i !== index),
                  labelField:
                    value.labelField === field.name ? null : value.labelField,
                })
              }
            >
              <X />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              Ключ в JSON
              <Input
                value={field.name}
                disabled={disabled}
                maxLength={63}
                pattern="[a-z][a-z0-9_]*"
                required
                onChange={(e) =>
                  setField(index, { ...field, name: e.target.value })
                }
              />
            </label>
            <label className="space-y-1 text-xs">
              Подпись
              <Input
                value={field.label}
                disabled={disabled}
                maxLength={120}
                onChange={(e) =>
                  setField(index, { ...field, label: e.target.value })
                }
              />
            </label>
            <Select
              value={field.type}
              disabled={disabled}
              onValueChange={(type) => {
                const rest = { ...field };
                delete rest.options;
                setField(index, {
                  ...rest,
                  type: type as RepeaterField["type"],
                  interface: "auto",
                });
              }}
            >
              <SelectTrigger
                aria-label={`Тип JSON-поля ${index + 1}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                {Object.entries({
                  text: "Текст",
                  email: "Email",
                  integer: "Целое число",
                  decimal: "Дробное число",
                  boolean: "Да / нет",
                  datetime: "Дата и время",
                }).map(([k, label]) => (
                  <SelectItem
                    key={k}
                    value={k}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={field.width}
              disabled={disabled}
              onValueChange={(width) =>
                setField(index, {
                  ...field,
                  width: width as RepeaterField["width"],
                })
              }
            >
              <SelectTrigger
                aria-label={`Ширина JSON-поля ${index + 1}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="full">Вся строка</SelectItem>
                <SelectItem value="half">Половина строки</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field.type === "text" && (
            <Select
              value={field.interface}
              disabled={disabled}
              onValueChange={(editor) => {
                const { options, ...rest } = field;
                setField(index, {
                  ...rest,
                  interface: editor as RepeaterField["interface"],
                  ...(editor === "select"
                    ? { options: options ?? [{ value: "", label: "" }] }
                    : {}),
                });
              }}
            >
              <SelectTrigger
                aria-label={`Редактор JSON-поля ${index + 1}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="auto">Однострочный текст</SelectItem>
                <SelectItem value="textarea">Многострочный текст</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="url">Ссылка</SelectItem>
                <SelectItem value="select">Список вариантов</SelectItem>
              </SelectContent>
            </Select>
          )}
          {field.interface === "select" && (
            <FieldChoiceSettings
              value={{
                ...defaultPresentation,
                interface: "select",
                options: field.options,
              }}
              disabled={disabled}
              onChange={(v) =>
                setField(index, { ...field, options: v.options })
              }
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={field.required}
              disabled={disabled}
              onCheckedChange={(v) =>
                setField(index, { ...field, required: v === true })
              }
            />
            Обязательно
          </label>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || value.fields.length >= 24}
        onClick={() => {
          let name = "field";
          let index = 1;
          while (value.fields.some((f) => f.name === name))
            name = `field_${index++}`;
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
        Поле элемента
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs">
          Минимум элементов
          <Input
            type="number"
            min={0}
            max={200}
            value={value.minItems}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, minItems: e.target.valueAsNumber })
            }
          />
        </label>
        <label className="space-y-1 text-xs">
          Максимум элементов
          <Input
            type="number"
            min={1}
            max={200}
            value={value.maxItems}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, maxItems: e.target.valueAsNumber })
            }
          />
        </label>
      </div>
      <Select
        value={value.labelField || "$none"}
        disabled={disabled}
        onValueChange={(v) =>
          onChange({ ...value, labelField: v === "$none" ? null : v })
        }
      >
        <SelectTrigger
          aria-label="Заголовок элемента"
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="$none">Заголовок: номер элемента</SelectItem>
          {value.fields
            .filter(
              (f, i, all) =>
                f.name && all.findIndex((v) => v.name === f.name) === i,
            )
            .map((f) => (
              <SelectItem
                key={f.name}
                value={f.name}
              >
                {f.label || f.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </section>
  );
}
