"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import {
  PresentedValue,
  statusColors,
} from "@/components/items/presented-value";
import type { FieldPresentation } from "@/components/items/types";
import type { ValueDisplay } from "@/components/items/presentation-types";
import { useUiCopy } from "@/lib/ui-copy";

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
  const copy = useUiCopy();

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
          {copy("Значение в таблице и при просмотре ")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {copy("Оформление не меняет хранимые данные и способ ввода. ")}
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
                        value: String(o.value),
                        color: "gray",
                      })) ?? [{ value: "", label: "", color: "gray" }],
                    },
          )
        }
      >
        <SelectTrigger
          aria-label={copy("Отображение значения")}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="auto">{copy("Автоматически")}</SelectItem>
          {["text", "integer", "boolean"].includes(type) && (
            <SelectItem value="status">{copy("Цветные статусы")}</SelectItem>
          )}
          {["integer", "decimal"].includes(type) && (
            <SelectItem value="number">{copy("Число")}</SelectItem>
          )}
          {type === "datetime" && (
            <SelectItem value="date">{copy("Дата и время")}</SelectItem>
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
                aria-label={copy("Значение статуса {{value0}}", {
                  value0: index + 1,
                })}
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
                aria-label={copy("Подпись статуса {{value0}}", {
                  value0: index + 1,
                })}
                placeholder={copy("Черновик")}
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
                <SelectTrigger
                  aria-label={copy("Цвет статуса {{value0}}", {
                    value0: index + 1,
                  })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={container}>
                  {Object.entries({
                    gray: copy("Серый"),
                    blue: copy("Синий"),
                    green: copy("Зелёный"),
                    amber: copy("Жёлтый"),
                    red: copy("Красный"),
                    violet: copy("Фиолетовый"),
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
                aria-label={copy("Удалить статус {{value0}}", {
                  value0: index + 1,
                })}
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
            {copy("Статус ")}
          </Button>
        </div>
      )}
      {display?.kind === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-sm">
            {copy("Знаков после запятой ")}
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
            {copy("Разделять разряды ")}
          </label>
          <label className="space-y-2 text-sm">
            {copy("Перед числом ")}
            <Input
              value={display.prefix}
              disabled={disabled}
              maxLength={20}
              onChange={(e) => set({ ...display, prefix: e.target.value })}
            />
          </label>
          <label className="space-y-2 text-sm">
            {copy("После числа ")}
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
              aria-label={copy("Формат даты")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={container}>
              <SelectItem value="date">{copy("Дата")}</SelectItem>
              <SelectItem value="datetime">{copy("Дата и время")}</SelectItem>
              <SelectItem value="time">{copy("Время")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Label htmlFor="display-timezone">{copy("Часовой пояс")}</Label>
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
          <span className="text-xs text-muted-foreground">
            {copy("Пример")}
          </span>
          <DisplayPreview display={display} />
        </div>
      )}
    </section>
  );
}

function DisplayPreview({ display }: { display: ValueDisplay }) {
  const copy = useUiCopy();

  try {
    if (display.kind === "date")
      new Intl.DateTimeFormat("ru", { timeZone: display.timeZone });
  } catch {
    return (
      <span className="text-xs text-destructive">
        {copy("Укажите часовой пояс IANA ")}
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
