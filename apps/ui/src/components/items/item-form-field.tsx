"use client";
import { Label } from "@/components/ui/label";
import { ItemReadonlyField } from "./item-readonly-field";
import { ItemFieldInput } from "./item-field-input";
import { displayValue } from "./item-display";
import type { OpenRelated } from "./relation-picker";
import type { Collection, CollectionField, Item } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFormField({
  field,
  item,
  formId,
  readonly,
  required,
  value,
  draftValues,
  catalog,
  onOpenRelated,
  onChange,
  onBusy,
  disabled,
  container,
}: {
  field: CollectionField;
  item?: Item;
  formId: string;
  readonly: boolean;
  required: boolean;
  value: string;
  draftValues: Record<string, string>;
  catalog: Collection[];
  onOpenRelated?: OpenRelated;
  onChange(value: string): void;
  onBusy(busy: boolean): void;
  disabled: boolean;
  container?: HTMLElement | null;
}) {
  const copy = useUiCopy();

  return (
    <>
      <Label
        htmlFor={`${formId}-${field.name}`}
        className={field.presentation?.label ? undefined : "font-mono"}
      >
        {field.presentation?.label || field.name}
        {!readonly && required && field.defaultValue === undefined && (
          <span aria-label={copy("значение необходимо")}> *</span>
        )}
        {field.type === "datetime" && !readonly && (
          <span className="ml-2 font-sans text-xs text-muted-foreground">
            UTC
          </span>
        )}
      </Label>
      {readonly && item ? (
        <ItemReadonlyField
          field={field}
          item={item}
          catalog={catalog}
          onOpenRelated={onOpenRelated}
        />
      ) : (
        <ItemFieldInput
          field={field}
          id={`${formId}-${field.name}`}
          value={value}
          catalog={catalog}
          draftValues={draftValues}
          creating={!item}
          onChange={onChange}
          onOpenRelated={onOpenRelated}
          onBusy={onBusy}
          disabled={disabled || readonly}
          container={container}
          required={!item && required && field.defaultValue === undefined}
        />
      )}
      {field.presentation?.rules?.computed && (
        <p className="text-xs text-muted-foreground">
          {copy("Вычисляется из связи при сохранении. ")}
        </p>
      )}
      {field.presentation?.description && (
        <p
          id={`${formId}-${field.name}-help`}
          className="whitespace-pre-wrap text-xs text-muted-foreground"
        >
          {field.presentation.description}
        </p>
      )}
      {field.type === "datetime" && !readonly && (
        <p className="text-xs text-muted-foreground">
          {copy("Время UTC, без пересчёта из часового пояса устройства. ")}
        </p>
      )}
      {!item && field.defaultValue !== undefined && (
        <p className="text-xs text-muted-foreground">
          {copy("По умолчанию:")}{" "}
          {field.presentation?.options?.find(
            (option) => option.value === field.defaultValue,
          )?.label ?? displayValue(field.defaultValue, field.type, copy)}
        </p>
      )}
    </>
  );
}
