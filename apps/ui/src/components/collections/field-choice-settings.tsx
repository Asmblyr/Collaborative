"use client";
import { Plus, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import type { FieldPresentation } from "@/components/items/types";

export function FieldChoiceSettings({ value, disabled, onChange }: {
  value: FieldPresentation; disabled: boolean; onChange: (v: FieldPresentation) => void;
}) {
  const options = value.options ?? [];
  const set = (index: number, key: "value" | "label", next: string) => onChange({ ...value,
    options: options.map((o, i) => i === index ? { ...o, [key]: next } : o) });
  return <div className="space-y-3 rounded-xl border p-4">
    <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-muted-foreground"><span>Значение в API</span><span>Подпись</span></div>
    {options.map((option, index) => <div key={index} className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
      <Input aria-label={`Значение варианта ${index + 1}`} value={option.value} disabled={disabled} maxLength={120}
        onChange={(e) => set(index, "value", e.target.value)} placeholder="draft" />
      <Input aria-label={`Подпись варианта ${index + 1}`} value={option.label} disabled={disabled} maxLength={120}
        onChange={(e) => set(index, "label", e.target.value)} placeholder="Черновик" />
      <Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Убрать вариант ${index + 1}`}
        onClick={() => onChange({ ...value, options: options.filter((_, i) => i !== index) })}><X /></Button>
    </div>)}
    <Button type="button" size="sm" variant="outline" disabled={disabled || options.length >= 100}
      onClick={() => onChange({ ...value, options: [...options, { value: "", label: "" }] })}><Plus />Добавить вариант</Button>
    <p className="text-xs text-muted-foreground">API принимает только указанные значения. Удалённые варианты сохраняются в старых записях.</p>
  </div>;
}
