"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import type { FieldPresentation } from "@/components/items/types";
import { useUiCopy } from "@/lib/ui-copy";

export function FieldChoiceSettings({
  value,
  type = "text",
  disabled,
  onChange,
}: {
  value: FieldPresentation;
  type?: string;
  disabled: boolean;
  onChange: (v: FieldPresentation) => void;
}) {
  const copy = useUiCopy();

  const options = value.options ?? [];
  const set = (index: number, key: "value" | "label", next: string) =>
    onChange({
      ...value,
      options: options.map((o, i) => (i === index ? { ...o, [key]: next } : o)),
    });
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-muted-foreground">
        <span>{copy("Значение в API")}</span>
        <span>{copy("Подпись")}</span>
      </div>
      {options.map((option, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2"
        >
          <Input
            aria-label={copy("Значение варианта {{value0}}", {
              value0: index + 1,
            })}
            type={type === "integer" ? "number" : "text"}
            step={type === "integer" ? 1 : undefined}
            value={option.value}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => set(index, "value", e.target.value)}
            placeholder={type === "integer" ? "0" : "draft"}
          />
          <Input
            aria-label={copy("Подпись варианта {{value0}}", {
              value0: index + 1,
            })}
            value={option.label}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => set(index, "label", e.target.value)}
            placeholder={copy("Черновик")}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={copy("Убрать вариант {{value0}}", {
              value0: index + 1,
            })}
            onClick={() =>
              onChange({
                ...value,
                options: options.filter((_, i) => i !== index),
              })
            }
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || options.length >= 100}
        onClick={() =>
          onChange({
            ...value,
            options: [...options, { value: "", label: "" }],
          })
        }
      >
        <Plus />
        {copy("Добавить вариант ")}
      </Button>
      <p className="text-xs text-muted-foreground">
        {copy(
          "API принимает только указанные значения. Удалённые варианты сохраняются в старых записях. ",
        )}
      </p>
    </div>
  );
}
