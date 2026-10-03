"use client";

import type { FieldEditorProps } from "@asmblyr/kit/ui";
import { Input } from "@asmblyr/kit/ui/input";
import { Button } from "@asmblyr/kit/ui/button";
import { colorPattern, isHexColor, readColorOptions } from "./color-options.ts";

export function ColorEditor({
  id,
  label,
  value,
  options,
  disabled,
  required,
  placeholder,
  describedBy,
  onChange,
}: FieldEditorProps) {
  const settings = readColorOptions(options);
  const palette = [...new Set(settings.palette.filter(isHexColor))];
  const valid = isHexColor(value);
  const outsidePalette =
    value &&
    !palette.some((entry) => entry.toLowerCase() === value.toLowerCase());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-9 shrink-0 rounded-lg border bg-muted"
          style={valid ? { backgroundColor: value } : undefined}
        />
        <Input
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          value={value}
          disabled={disabled}
          required={required}
          readOnly={!settings.allowCustom}
          pattern={colorPattern}
          placeholder={placeholder || "#3b82f6"}
          title="Цвет в формате #RRGGBB"
          className="font-mono"
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !value}
          aria-label={`Очистить ${label}`}
          onClick={() => onChange("")}
        >
          Очистить
        </Button>
      </div>
      <div
        role="group"
        aria-label={`Палитра: ${label}`}
        className="flex flex-wrap gap-2"
      >
        {palette.map((color) => (
          <Button
            key={color}
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Выбрать ${color}`}
            title={color}
            aria-pressed={color.toLowerCase() === value.toLowerCase()}
            disabled={disabled}
            className="rounded-full p-1 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
            onClick={() => onChange(color)}
          >
            <span
              aria-hidden="true"
              className="size-full rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            />
          </Button>
        ))}
      </div>
      {!settings.allowCustom && (
        <p className="text-xs text-muted-foreground">
          {outsidePalette
            ? "Сохранённое значение вне палитры. Можно оставить его или выбрать новый цвет."
            : "Выберите цвет из палитры."}
        </p>
      )}
    </div>
  );
}
