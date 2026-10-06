"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
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
import { FieldChoiceSettings } from "./field-choice-settings";
import { defaultPresentation } from "./field-presentation-defaults";
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
        <h3 className="text-sm font-medium">{copy("Поля каждого элемента")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy(
            "Список хранится в одном JSON-поле. Изменение настройки не переписывает существующие данные. ",
          )}
        </p>
      </div>
      {value.fields.map((field, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border bg-muted/20 p-3"
        >
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs font-medium text-muted-foreground">
              {copy("Поле ")}
              {index + 1}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("Поднять JSON-поле {{value0}}", {
                value0: index + 1,
              })}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("Опустить JSON-поле {{value0}}", {
                value0: index + 1,
              })}
              disabled={disabled || index === value.fields.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("Удалить JSON-поле {{value0}}", {
                value0: index + 1,
              })}
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
              {copy("Ключ в JSON ")}
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
              {copy("Подпись ")}
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
                aria-label={copy("Тип JSON-поля {{value0}}", {
                  value0: index + 1,
                })}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                {Object.entries({
                  text: copy("Текст"),
                  email: "Email",
                  integer: copy("Целое число"),
                  decimal: copy("Дробное число"),
                  boolean: copy("Да / нет"),
                  datetime: copy("Дата и время"),
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
                aria-label={copy("Ширина JSON-поля {{value0}}", {
                  value0: index + 1,
                })}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="full">{copy("Вся строка")}</SelectItem>
                <SelectItem value="half">{copy("Половина строки")}</SelectItem>
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
                aria-label={copy("Редактор JSON-поля {{value0}}", {
                  value0: index + 1,
                })}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="auto">
                  {copy("Однострочный текст")}
                </SelectItem>
                <SelectItem value="textarea">
                  {copy("Многострочный текст")}
                </SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="url">{copy("Ссылка")}</SelectItem>
                <SelectItem value="select">
                  {copy("Список вариантов")}
                </SelectItem>
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
                setField(index, {
                  ...field,
                  options: v.options?.map((option) => ({
                    ...option,
                    value: String(option.value),
                  })),
                })
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
            {copy("Обязательно ")}
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
        {copy("Поле элемента ")}
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs">
          {copy("Минимум элементов ")}
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
          {copy("Максимум элементов ")}
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
