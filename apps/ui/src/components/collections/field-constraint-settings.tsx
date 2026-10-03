"use client";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldPresentation } from "@/components/items/types";

export function FieldConstraintSettings({ value, type, disabled, onChange }: {
  value: FieldPresentation; type: string; disabled: boolean; onChange: (value: FieldPresentation) => void;
}) {
  if (!["text", "email", "integer"].includes(type)) return null;
  const bounds = type === "integer" ? [{ key: "min", label: "Минимум" }, { key: "max", label: "Максимум" }]
    : [{ key: "minLength", label: "Минимум символов" }, { key: "maxLength", label: "Максимум символов" }];
  return <fieldset className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Ограничения значения</legend>
    <div className="grid grid-cols-2 gap-4">{bounds.map(({ key, label }) => <div key={key} className="space-y-2"><Label htmlFor={`constraint-${key}`}>{label}</Label>
      <Input id={`constraint-${key}`} type="number" step={1} disabled={disabled} placeholder="Без ограничения"
        min={type === "integer" ? -2147483648 : 0} max={type === "integer" ? 2147483647 : 100000}
        value={value.constraints?.[key as keyof NonNullable<FieldPresentation["constraints"]>] ?? ""} onChange={(e) => {
          const constraints = { ...value.constraints };
          if (!e.target.value) delete constraints[key as keyof typeof constraints];
          else constraints[key as keyof typeof constraints] = e.target.valueAsNumber;
          onChange({ ...value, constraints });
        }} /></div>)}</div><p className="text-xs text-muted-foreground">Проверяются при записи через API. Для форматированного текста длина считается без разметки. Существующие записи не изменяются.</p>
  </fieldset>;
}
