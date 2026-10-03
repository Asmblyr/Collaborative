"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import type { RepeaterField, RepeaterSettings } from "./presentation-types";
import type { CollectionField, Item, ItemValue } from "./types";
import { ItemFieldInput } from "./item-field-input";
import { inputValue, payloadValue } from "./item-input-values";

export function repeaterChild(field: RepeaterField): CollectionField {
  return {
    ...field,
    nullable: true,
    presentation: {
      label: field.label,
      description: "",
      placeholder: "",
      order: 0,
      group: "",
      width: field.width,
      interface: field.interface,
      ...(field.options ? { options: field.options } : {}),
    },
  };
}

export function repeaterRows(value: string): Item[] | null {
  if (!value) return [];
  try {
    const data: unknown = JSON.parse(value);
    return Array.isArray(data) &&
      data.every((r) => r && typeof r === "object" && !Array.isArray(r))
      ? data
      : null;
  } catch {
    return null;
  }
}

interface RepeaterInputProps {
  value: string;
  settings: RepeaterSettings;
  onChange: (value: string) => void;
  disabled: boolean;
  id: string;
  container?: HTMLElement | null;
}

export function RepeaterInput(props: RepeaterInputProps) {
  const { value, disabled, id, onChange } = props;
  const rows = repeaterRows(value);
  if (rows === null)
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Сохранённое значение не является списком объектов. Данные оставлены
          без изменений. Для повторяемой формы нужен JSON-массив объектов.
        </p>
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
      </div>
    );
  return (
    <RepeaterRowsInput
      {...props}
      rows={rows}
    />
  );
}

function RepeaterRowsInput({
  rows,
  settings,
  onChange,
  disabled,
  id,
  container,
}: RepeaterInputProps & { rows: Item[] }) {
  // Mount after legacy raw JSON becomes a list, so every row starts with an identity.
  const [keys, setKeys] = useState(() => rows.map(() => crypto.randomUUID()));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  function update(next: Item[], nextKeys = keys) {
    setKeys(nextKeys);
    onChange(JSON.stringify(next));
  }
  function move(index: number, offset: number) {
    const next = [...rows],
      ids = [...keys];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    update(next, ids);
  }
  return (
    <div
      id={id}
      className="@container space-y-3"
      role="group"
      aria-label="Повторяемая форма"
    >
      {rows.map((row, index) => {
        const key = keys[index] ?? `${id}-${index}`;
        const closed = collapsed.includes(key);
        const label = settings.labelField ? row[settings.labelField] : null;
        const optionLabel = settings.fields
          .find((f) => f.name === settings.labelField)
          ?.options?.find((o) => o.value === label)?.label;
        const title =
          optionLabel ??
          ((typeof label === "string" || typeof label === "number") &&
          String(label).trim()
            ? String(label).slice(0, 100)
            : `Элемент ${index + 1}`);
        return (
          <section
            key={key}
            className="overflow-hidden rounded-xl border bg-background"
          >
            <div className="flex items-center gap-1 bg-muted/30 px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-w-0 flex-1 justify-start"
                aria-expanded={!closed}
                onClick={() =>
                  setCollapsed(
                    closed
                      ? collapsed.filter((v) => v !== key)
                      : [...collapsed, key],
                  )
                }
              >
                <ChevronDown className={closed ? "-rotate-90" : ""} />
                <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                <span className="truncate">{title}</span>
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled || index === 0}
                aria-label={`Поднять элемент ${index + 1}`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled || index === rows.length - 1}
                aria-label={`Опустить элемент ${index + 1}`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Удалить элемент ${index + 1}`}
                onClick={() =>
                  update(
                    rows.filter((_, i) => i !== index),
                    keys.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            </div>
            <div
              hidden={closed}
              className="grid grid-cols-1 gap-4 p-4 @min-[420px]:grid-cols-2"
              onInvalidCapture={() => setCollapsed([])}
            >
              {settings.fields.map((child) => {
                const field = repeaterChild(child),
                  childId = `${id}-${key}-${child.name}`;
                return (
                  <div
                    key={child.name}
                    className={`min-w-0 space-y-2 ${child.width === "full" ? "@min-[420px]:col-span-2" : ""}`}
                  >
                    <Label htmlFor={childId}>
                      {child.label || child.name}
                      {child.required && " *"}
                    </Label>
                    <ItemFieldInput
                      id={childId}
                      field={field}
                      value={inputValue(field, row)}
                      disabled={disabled}
                      required={child.required}
                      catalog={[]}
                      container={container}
                      onChange={(draft) => {
                        let parsed: ItemValue;
                        try {
                          parsed = payloadValue(field, draft);
                        } catch {
                          parsed = draft;
                        }
                        update(
                          rows.map((r, i) =>
                            i === index ? { ...r, [child.name]: parsed } : r,
                          ),
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {!rows.length && (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          Пока нет элементов
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || rows.length >= settings.maxItems}
          onClick={() => update([...rows, {}], [...keys, crypto.randomUUID()])}
        >
          <Plus />
          Добавить элемент
        </Button>
        <span className="text-xs text-muted-foreground">
          {rows.length} / {settings.maxItems}
          {settings.minItems > 0 && ` · минимум ${settings.minItems}`}
        </span>
      </div>
    </div>
  );
}
