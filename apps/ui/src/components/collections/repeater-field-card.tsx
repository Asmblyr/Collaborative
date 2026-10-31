"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
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
import type { RepeaterField } from "@/components/items/presentation-types";
import { FieldChoiceSettings } from "./field-choice-settings";
import { defaultPresentation } from "./field-presentation-defaults";
import { useUiCopy } from "@/lib/ui-copy";

export function RepeaterFieldCard({
  field,
  index,
  total,
  disabled,
  container,
  onChange,
  onMove,
  onRemove,
}: {
  field: RepeaterField;
  index: number;
  total: number;
  disabled: boolean;
  container?: HTMLElement | null;
  onChange: (field: RepeaterField) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {copy("Поле")} {index + 1}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={copy("Поднять JSON-поле {{value0}}", {
            value0: index + 1,
          })}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
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
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
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
          disabled={disabled || total === 1}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs">
          {copy("Ключ в JSON")}
          <Input
            value={field.name}
            disabled={disabled}
            maxLength={63}
            pattern="[a-z][a-z0-9_]*"
            required
            onChange={(event) =>
              onChange({ ...field, name: event.target.value })
            }
          />
        </label>
        <label className="space-y-1 text-xs">
          {copy("Подпись")}
          <Input
            value={field.label}
            disabled={disabled}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...field, label: event.target.value })
            }
          />
        </label>
        <Select
          value={field.type}
          disabled={disabled}
          onValueChange={(type) => {
            const rest = { ...field };
            delete rest.options;
            onChange({
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
            }).map(([key, label]) => (
              <SelectItem
                key={key}
                value={key}
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
            onChange({
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
            onChange({
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
            <SelectItem value="auto">{copy("Однострочный текст")}</SelectItem>
            <SelectItem value="textarea">
              {copy("Многострочный текст")}
            </SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="url">{copy("Ссылка")}</SelectItem>
            <SelectItem value="select">{copy("Список вариантов")}</SelectItem>
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
          onChange={(next) =>
            onChange({
              ...field,
              options: next.options?.map((option) => ({
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
          onCheckedChange={(checked) =>
            onChange({ ...field, required: checked === true })
          }
        />
        {copy("Обязательно")}
      </label>
    </div>
  );
}
