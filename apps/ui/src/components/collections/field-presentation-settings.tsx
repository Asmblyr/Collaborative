"use client";

import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { FieldPresentation } from "@/components/items/types";
import { FieldChoiceSettings } from "./field-choice-settings";
import { FieldConstraintSettings } from "./field-constraint-settings";
import { RepeaterSettings, defaultRepeater } from "./repeater-settings";
import { ValueDisplaySettings } from "./value-display-settings";
import { FieldInterfaceSettings } from "./field-interface-settings";

export function FieldPresentationSettings({
  value,
  type,
  disabled,
  portalContainer,
  onChange,
}: {
  value: FieldPresentation;
  type: string;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
  onChange: (value: FieldPresentation) => void;
}) {
  const set = <K extends keyof FieldPresentation>(
    key: K,
    next: FieldPresentation[K],
  ) => onChange({ ...value, [key]: next });
  const textLike = ["text", "email", "integer", "decimal", "json"].includes(
    type,
  );
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="presentation-label">Подпись поля</Label>
        <Input
          id="presentation-label"
          value={value.label}
          disabled={disabled}
          maxLength={120}
          placeholder="По умолчанию — имя поля"
          onChange={(e) => set("label", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="presentation-description">Подсказка под полем</Label>
        <Textarea
          id="presentation-description"
          value={value.description}
          disabled={disabled}
          maxLength={1000}
          placeholder="Помогите пользователю заполнить поле"
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      {textLike && (
        <div className="space-y-2">
          <Label htmlFor="presentation-placeholder">Плейсхолдер</Label>
          <Input
            id="presentation-placeholder"
            value={value.placeholder}
            disabled={disabled}
            maxLength={255}
            placeholder="Пример значения"
            onChange={(e) => set("placeholder", e.target.value)}
          />
        </div>
      )}
      {textLike && (
        <FieldInterfaceSettings
          value={value}
          type={type}
          disabled={disabled}
          container={portalContainer}
          onChange={onChange}
        />
      )}
      {(value.interface === "select" || value.interface === "multiselect") && (
        <FieldChoiceSettings
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      <FieldConstraintSettings
        value={value}
        type={type}
        disabled={disabled}
        onChange={onChange}
      />
      {value.interface === "repeater" && (
        <RepeaterSettings
          value={value.repeater ?? defaultRepeater}
          disabled={disabled}
          container={portalContainer}
          onChange={(repeater) => set("repeater", repeater)}
        />
      )}
      {!value.extension && (
        <ValueDisplaySettings
          value={value}
          type={type}
          disabled={disabled}
          container={portalContainer}
          onChange={onChange}
        />
      )}
      {type !== "alias" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="presentation-width">Ширина в форме</Label>
            <Select
              value={value.width}
              disabled={disabled}
              onValueChange={(v) =>
                set("width", v as FieldPresentation["width"])
              }
            >
              <SelectTrigger
                id="presentation-width"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                <SelectItem value="full">Вся строка</SelectItem>
                <SelectItem value="half">Половина строки</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="presentation-group">Группа</Label>
            <Input
              id="presentation-group"
              value={value.group}
              disabled={disabled}
              maxLength={120}
              placeholder="Например, Основное"
              onChange={(e) => set("group", e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="presentation-order">Порядок</Label>
        <Input
          id="presentation-order"
          type="number"
          min={-10000}
          max={10000}
          step={1}
          required
          value={Number.isNaN(value.order) ? "" : value.order}
          disabled={disabled}
          onChange={(e) => set("order", e.target.valueAsNumber)}
        />
        <p className="text-xs text-muted-foreground">
          Меньшее число — выше. При одинаковом значении сохраняется порядок
          полей.
        </p>
      </div>
    </div>
  );
}
