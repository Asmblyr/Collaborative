"use client";

import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { useUiCopy } from "@/lib/ui-copy";

export type PrimaryKeyType = "uuid" | "serial" | "bigserial" | "text";

export function CollectionPrimaryKeyFields({
  name,
  type,
  onNameChange,
  onTypeChange,
  disabled,
  portalContainer,
}: {
  name: string;
  type: PrimaryKeyType;
  onNameChange: (value: string) => void;
  onTypeChange: (value: PrimaryKeyType) => void;
  disabled: boolean;
  portalContainer: HTMLElement | null;
}) {
  const copy = useUiCopy();
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h3 className="text-sm font-medium">{copy("Основной ключ")}</h3>
      <div className="space-y-2">
        <Label htmlFor="collection-primary-name">{copy("Название поля")}</Label>
        <Input
          id="collection-primary-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          required
          maxLength={63}
          pattern="[a-z][a-z0-9_]*"
          disabled={disabled}
          className="h-10 font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="collection-primary-type">{copy("Тип ключа")}</Label>
        <Select
          value={type}
          onValueChange={(value) => onTypeChange(value as PrimaryKeyType)}
          disabled={disabled}
        >
          <SelectTrigger
            id="collection-primary-type"
            className="h-10 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="uuid">{copy("UUID (автоматически)")}</SelectItem>
            <SelectItem value="serial">{copy("Автоинкремент")}</SelectItem>
            <SelectItem value="bigserial">
              {copy("Большой автоинкремент ")}
            </SelectItem>
            <SelectItem value="text">
              {copy("Строка (ввод вручную)")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
