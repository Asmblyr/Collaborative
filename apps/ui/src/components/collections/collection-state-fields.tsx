"use client";

import { defaultCollectionState, type CollectionState } from "@asmblyr/contracts";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { Collection } from "@/components/items/types";

type StateOption = CollectionState["statuses"][number];
const colors: { value: StateOption["color"]; label: string; className: string }[] = [
  { value: "green", label: "Зелёный", className: "bg-emerald-500" },
  { value: "gray", label: "Серый", className: "bg-slate-400" },
  { value: "amber", label: "Янтарный", className: "bg-amber-500" },
  { value: "blue", label: "Синий", className: "bg-blue-500" },
  { value: "red", label: "Красный", className: "bg-red-500" },
  { value: "violet", label: "Фиолетовый", className: "bg-violet-500" },
];

export function CollectionStateFields({
  collection,
  value,
  onChange,
  disabled,
  container,
}: {
  collection: Collection;
  value: CollectionState | null;
  onChange: (state: CollectionState | null) => void;
  disabled: boolean;
  container: HTMLElement | null;
}) {
  const existing = collection.fields.find((field) => field.name === "status");
  const incompatible =
    collection.primaryKey.name === "status" ||
    Boolean(existing && (existing.type !== "text" || existing.relation));
  function changeStatus(index: number, patch: Partial<StateOption>) {
    if (!value) return;
    const statuses = value.statuses.map((status, i) =>
      i === index ? { ...status, ...patch } : status,
    );
    const defaultValue =
      patch.value !== undefined && value.defaultValue === value.statuses[index].value
        ? patch.value
        : value.defaultValue;
    onChange({ ...value, defaultValue, statuses });
  }
  function addStatus() {
    if (!value) return;
    let number = value.statuses.length + 1;
    while (value.statuses.some((status) => status.value === `state_${number}`)) number += 1;
    onChange({
      ...value,
      statuses: [
        ...value.statuses,
        { value: `state_${number}`, label: "Новое состояние", color: "blue", hidden: false },
      ],
    });
  }
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border p-4">
        <Checkbox
          id="system-state-enabled"
          checked={Boolean(value)}
          className="mt-0.5"
          disabled={disabled || Boolean(collection.state) || incompatible}
          onCheckedChange={(checked) =>
            onChange(checked === true ? defaultCollectionState() : null)
          }
        />
        <div className="space-y-1">
          <Label htmlFor="system-state-enabled">Системное поле «Состояние»</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {incompatible
              ? "Имя status уже занято несовместимым полем. Для состояния нужно обычное текстовое поле."
              : collection.state
                ? "Структура status защищена. Значение можно менять в редакторе записи и через API при наличии прав."
                : existing
                  ? "Используем существующее поле status, сохранив значения и пустые состояния. Все используемые коды должны быть в списке ниже."
                  : "Добавим status. Существующие записи получат выбранное состояние по умолчанию."}
          </p>
        </div>
      </div>
      {value && (
        <>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Состояния записей</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                «В списке» определяет начальный фильтр таблицы. Скрытые записи можно показать,
                изменив фильтр.
              </p>
            </div>
            {value.statuses.map((status, index) => (
              <div key={index} className="space-y-3 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full ${colors.find((color) => color.value === status.color)?.className}`}
                  />
                  <Input
                    aria-label={`Название состояния ${index + 1}`}
                    value={status.label}
                    maxLength={100}
                    required
                    disabled={disabled}
                    onChange={(event) => changeStatus(index, { label: event.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Удалить состояние ${status.label}`}
                    disabled={
                      disabled || value.statuses.length === 1 || status.value === value.defaultValue
                    }
                    onClick={() =>
                      onChange({ ...value, statuses: value.statuses.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`state-code-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Код в API
                    </Label>
                    <Input
                      id={`state-code-${index}`}
                      value={status.value}
                      required
                      maxLength={63}
                      pattern="[a-z][a-z0-9_]*"
                      disabled={disabled}
                      className="font-mono text-xs"
                      onChange={(event) => changeStatus(index, { value: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`state-color-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Цвет
                    </Label>
                    <Select
                      value={status.color}
                      disabled={disabled}
                      onValueChange={(color) =>
                        changeStatus(index, { color: color as StateOption["color"] })
                      }
                    >
                      <SelectTrigger id={`state-color-${index}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent container={container}>
                        {colors.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <span
                              aria-hidden
                              className={`size-2 rounded-full ${color.className}`}
                            />
                            {color.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox
                      id={`state-visible-${index}`}
                      checked={!status.hidden}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        changeStatus(index, { hidden: checked !== true })
                      }
                    />
                    <Label htmlFor={`state-visible-${index}`} className="whitespace-nowrap text-xs">
                      В списке
                    </Label>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || value.statuses.length >= 20}
              onClick={addStatus}
            >
              <Plus className="size-4" />
              Добавить состояние
            </Button>
            <p className="text-xs text-muted-foreground">
              Код нельзя удалить или заменить, пока его используют записи. Название и цвет можно
              менять свободно.
            </p>
          </div>
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="state-default">Состояние новой записи</Label>
            <Select
              value={value.defaultValue}
              disabled={disabled}
              onValueChange={(defaultValue) => onChange({ ...value, defaultValue })}
            >
              <SelectTrigger id="state-default" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                {value.statuses
                  .filter(
                    (status, index, all) =>
                      status.value &&
                      all.findIndex((item) => item.value === status.value) === index,
                  )
                  .map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label || status.value}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
