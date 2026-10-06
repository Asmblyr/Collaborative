"use client";

import type { SearchPriority } from "@asmblyr-collaborative/contracts";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { useUiCopy } from "@/lib/ui-copy";

export function SearchPrioritySettings({
  value,
  disabled,
  onChange,
  container,
}: {
  value: SearchPriority | null;
  disabled: boolean;
  onChange: (value: SearchPriority | null) => void;
  container?: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{copy("Приоритет в поиске")}</Label>
      <Select
        value={value ?? "auto"}
        onValueChange={(next) =>
          onChange(next === "auto" ? null : (next as SearchPriority))
        }
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="auto">{copy("Автоматически")}</SelectItem>
          <SelectItem value="primary">{copy("Основное поле")}</SelectItem>
          <SelectItem value="secondary">{copy("Дополнительное")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {copy(
          "При равном совпадении основные поля выше дополнительных. Автоматический приоритет учитывает название записи; для связи — название связанной записи.",
        )}
      </p>
    </div>
  );
}
