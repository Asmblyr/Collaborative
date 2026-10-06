"use client";

import { useId } from "react";
import type { FieldInterfaceSettingsProps } from "@asmblyr-collaborative/kit/ui";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { colorPattern, isHexColor, readColorOptions } from "./color-options.ts";

export function ColorSettings({
  options,
  disabled,
  onChange,
}: FieldInterfaceSettingsProps) {
  const id = useId();
  const settings = readColorOptions(options);

  function setPalette(palette: string[]) {
    onChange({ ...options, ...settings, palette });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Палитра этого поля. Цвет будет виден в карточке и таблице.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {settings.palette.map((color, index) => (
          <div
            key={index}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded border"
              style={isHexColor(color) ? { backgroundColor: color } : undefined}
            />
            <Input
              aria-label={`Цвет палитры ${index + 1}`}
              value={color}
              disabled={disabled}
              pattern={colorPattern}
              title="Цвет в формате #RRGGBB"
              required
              maxLength={7}
              className="min-w-0 font-mono text-xs"
              onChange={(event) =>
                setPalette(
                  settings.palette.map((entry, at) =>
                    at === index ? event.target.value : entry,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Удалить цвет ${index + 1}`}
              disabled={disabled || settings.palette.length === 1}
              onClick={() =>
                setPalette(settings.palette.filter((_, at) => at !== index))
              }
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || settings.palette.length >= 24}
        onClick={() => setPalette([...settings.palette, "#000000"])}
      >
        Добавить цвет
      </Button>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={settings.allowCustom}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({ ...options, ...settings, allowCustom: checked === true })
          }
        />
        <label
          htmlFor={id}
          className="text-sm"
        >
          Разрешать произвольный цвет
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Палитра управляет выбором в форме. Через API поле остаётся обычной
        строкой.
      </p>
    </div>
  );
}
