"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import {
  PresentedValue,
  statusColors,
} from "@/components/items/presented-value";
import type { FieldPresentation } from "@/components/items/types";
import type { ValueDisplay } from "@/components/items/presentation-types";

export function ValueDisplaySettings({
  value,
  type,
  disabled,
  container,
  onChange,
}: {
  value: FieldPresentation;
  type: string;
  disabled: boolean;
  container?: HTMLElement | null;
  onChange: (value: FieldPresentation) => void;
}) {
  const display = value.display;
  const set = (next?: ValueDisplay) => {
    const rest = { ...value };
    delete rest.display;
    onChange(next ? { ...rest, display: next } : rest);
  };
  if (!["text", "integer", "decimal", "boolean", "datetime"].includes(type))
    return null;
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          Значение в таблице и при просмотре
        </h3>
        <p className="text-xs text-muted-foreground">
          Оформление не меняет хранимые данные и способ ввода.
        </p>
      </div>
      <Select
        value={display?.kind ?? "auto"}
        disabled={disabled}
        onValueChange={(kind) =>
          set(
            kind === "auto"
              ? undefined
              : kind === "number"
                ? {
                    kind,
                    decimals: type === "integer" ? 0 : 2,
                    grouping: true,
                    prefix: "",
                    suffix: "",
                  }
                : kind === "date"
                  ? { kind, format: "datetime", timeZone: "UTC" }
                  : {
                      kind: "status",
                      statuses: value.options?.map((o) => ({
                        ...o,
                        color: "gray",
                      })) ?? [{ value: "", label: "", color: "gray" }],
                    },
          )
        }
      >
        <SelectTrigger
          aria-label="Отображение значения"
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="auto">Автоматически</SelectItem>
          {["text", "integer", "boolean"].includes(type) && (
            <SelectItem value="status">Цветные статусы</SelectItem>
          )}
          {["integer", "decimal"].includes(type) && (
            <SelectItem value="number">Число</SelectItem>
          )}
          {type === "datetime" && (
            <SelectItem value="date">Дата и время</SelectItem>
          )}
        </SelectContent>
      </Select>
      {display?.kind === "status" && (
        <div className="space-y-2">
          {display.statuses.map((s, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_6rem_auto] items-center gap-2"
            >
              <Input
                aria-label={`Значение статуса ${index + 1}`}
                placeholder="draft"
                value={s.value}
                disabled={disabled}
                maxLength={120}
                onChange={(e) =>
                  set({
                    ...display,
                    statuses: display.statuses.map((v, i) =>
                      i === index ? { ...v, value: e.target.value } : v,
                    ),
                  })
                }
              />
              <Input
                aria-label={`Подпись статуса ${index + 1}`}
                placeholder="Черновик"
                value={s.label}
                disabled={disabled}
                maxLength={120}
                onChange={(e) =>
                  set({
                    ...display,
                    statuses: display.statuses.map((v, i) =>
                      i === index ? { ...v, label: e.target.value } : v,
                    ),
                  })
                }
              />
              <Select
                value={s.color}
                disabled={disabled}
                onValueChange={(color) =>
                  set({
                    ...display,
                    statuses: display.statuses.map((v, i) =>
                      i === index
                        ? { ...v, color: color as typeof s.color }
                        : v,
                    ),
                  })
                }
              >
                <SelectTrigger aria-label={`Цвет статуса ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={container}>
                  {Object.entries({
                    gray: "Серый",
                    blue: "Синий",
                    green: "Зелёный",
                    amber: "Жёлтый",
                    red: "Красный",
                    violet: "Фиолетовый",
                  }).map(([color, label]) => (
                    <SelectItem
                      key={color}
                      value={color}
                    >
                      <span
                        className={`rounded px-1 ${statusColors[color as keyof typeof statusColors]}`}
                      >
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Удалить статус ${index + 1}`}
                disabled={disabled || display.statuses.length === 1}
                onClick={() =>
                  set({
                    ...display,
                    statuses: display.statuses.filter((_, i) => i !== index),
                  })
                }
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || display.statuses.length >= 100}
            onClick={() =>
              set({
                ...display,
                statuses: [
                  ...display.statuses,
                  { value: "", label: "", color: "gray" },
                ],
              })
            }
          >
            <Plus />
            Статус
          </Button>
        </div>
      )}
      {display?.kind === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-sm">
            Знаков после запятой
            <Input
              type="number"
              min={0}
              max={20}
              value={display.decimals}
              disabled={disabled}
              onChange={(e) =>
                set({ ...display, decimals: e.target.valueAsNumber })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={display.grouping}
              disabled={disabled}
              onCheckedChange={(v) => set({ ...display, grouping: v === true })}
            />
            Разделять разряды
          </label>
          <label className="space-y-2 text-sm">
            Перед числом
            <Input
              value={display.prefix}
              disabled={disabled}
              maxLength={20}
              onChange={(e) => set({ ...display, prefix: e.target.value })}
            />
          </label>
          <label className="space-y-2 text-sm">
            После числа
            <Input
              value={display.suffix}
              disabled={disabled}
              maxLength={20}
              onChange={(e) => set({ ...display, suffix: e.target.value })}
            />
          </label>
        </div>
      )}
      {display?.kind === "date" && (
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={display.format}
            disabled={disabled}
            onValueChange={(v) =>
              set({ ...display, format: v as typeof display.format })
            }
          >
            <SelectTrigger
              aria-label="Формат даты"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={container}>
              <SelectItem value="date">Дата</SelectItem>
              <SelectItem value="datetime">Дата и время</SelectItem>
              <SelectItem value="time">Время</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Label htmlFor="display-timezone">Часовой пояс</Label>
            <Input
              id="display-timezone"
              placeholder="Europe/Moscow"
              value={display.timeZone}
              disabled={disabled}
              onChange={(e) => set({ ...display, timeZone: e.target.value })}
            />
          </div>
        </div>
      )}
      {display && (
        <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
          <span className="text-xs text-muted-foreground">Пример</span>
          <DisplayPreview display={display} />
        </div>
      )}
    </section>
  );
}

function DisplayPreview({ display }: { display: ValueDisplay }) {
  try {
    if (display.kind === "date")
      new Intl.DateTimeFormat("ru", { timeZone: display.timeZone });
  } catch {
    return (
      <span className="text-xs text-destructive">
        Укажите часовой пояс IANA
      </span>
    );
  }
  if (
    display.kind === "number" &&
    (!Number.isInteger(display.decimals) ||
      display.decimals < 0 ||
      display.decimals > 20)
  )
    return null;
  return (
    <PresentedValue
      display={display}
      value={
        display.kind === "status"
          ? display.statuses[0]?.value
          : display.kind === "number"
            ? "1234567.895"
            : "2026-09-30T12:30:00Z"
      }
    />
  );
}
