"use client";

import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";

export function CollectionSystemFields({
  createdAt,
  updatedAt,
  state,
  disabled,
  onChange,
}: {
  createdAt: boolean;
  updatedAt: boolean;
  state: boolean;
  disabled: boolean;
  onChange: (
    field: "createdAt" | "updatedAt" | "state",
    enabled: boolean,
  ) => void;
}) {
  const copy = useUiCopy();

  const fields = [
    {
      key: "createdAt" as const,
      checked: createdAt,
      name: "created_at",
      label: copy("Когда создано"),
    },
    {
      key: "updatedAt" as const,
      checked: updatedAt,
      name: "updated_at",
      label: copy("Когда обновлено"),
    },
    {
      key: "state" as const,
      checked: state,
      name: "status",
      label: copy("Состояние"),
    },
  ];
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h3 className="text-sm font-medium">{copy("Системные поля")}</h3>
      {fields.map((field) => (
        <div
          key={field.key}
          className="flex items-center gap-3"
        >
          <Checkbox
            id={`collection-${field.key}`}
            checked={field.checked}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(field.key, checked === true)}
          />
          <Label
            htmlFor={`collection-${field.key}`}
            className="flex flex-1 items-center justify-between gap-4"
          >
            {field.label}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {field.name}
            </span>
          </Label>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {copy(
          "Даты заполняются автоматически. Состояние новой записи — «Опубликовано». Черновики и архив скрыты из списка по умолчанию. Состояния можно настроить после создания коллекции. ",
        )}
      </p>
    </div>
  );
}
