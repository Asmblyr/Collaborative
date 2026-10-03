"use client";

import { useLayoutEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import type { OpenRelated } from "./relation-picker";
import { ItemFieldInput } from "./item-field-input";
import { inputValue, payloadValue } from "./item-input-values";
import type { Collection, CollectionField, Item, ItemValue } from "./types";
import { ConfiguredFieldLayout } from "./configured-field-layout";
import { layoutHasConditions } from "./form-layout-model";
import { ItemReadonlyField } from "./item-readonly-field";
import type { FormLayout } from "./presentation-types";
import { ItemFormActions } from "./item-form-actions";
import { displayValue } from "./item-display";

interface ItemFormProps {
  fields: CollectionField[];
  formLayout?: FormLayout | null;
  readOnlyFields?: string[];
  preview?: boolean;
  catalog: Collection[];
  onOpenRelated?: OpenRelated;
  primaryKey: Collection["primaryKey"];
  item?: Item;
  pending: boolean;
  embedded?: boolean;
  id?: string;
  hideActions?: boolean;
  portalContainer?: HTMLElement | null;
  onSave: (values: Record<string, ItemValue>) => Promise<void>;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (count: number) => void;
  onSubmitAttempt?: () => void;
  initialValues?: Item;
  allowUnchanged?: boolean;
  onReferenceChange?: (field: string, value: string) => void;
}

export function ItemForm({
  fields,
  formLayout,
  readOnlyFields = [],
  preview = false,
  catalog,
  onOpenRelated,
  primaryKey,
  item,
  pending,
  embedded = false,
  id,
  hideActions = false,
  portalContainer,
  onSave,
  onCancel,
  onBusyChange,
  onDirtyChange,
  onSubmitAttempt,
  initialValues,
  allowUnchanged = false,
  onReferenceChange,
}: ItemFormProps) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.name, inputValue(field, { ...item, ...initialValues })]),
    ),
  );
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [manualKey, setManualKey] = useState(String(initialValues?.[primaryKey.name] ?? ""));
  const [issue, setIssue] = useState({ field: "", attempt: 0 });
  const [showHidden, setShowHidden] = useState(false);
  const writable = fields.filter((f) => !readOnlyFields.includes(f.name));
  const changedCount =
    writable.filter((field) =>
      item ? values[field.name] !== inputValue(field, item) : values[field.name] !== "",
    ).length + (!item && manualKey ? 1 : 0);
  useLayoutEffect(() => {
    onDirtyChange?.(changedCount);
  }, [changedCount, onDirtyChange]);
  const forced = new Set(
    showHidden
      ? fields.map((f) => f.name)
      : writable
          .filter(
            (f) =>
              !item &&
              (f.required || !f.nullable) &&
              f.defaultValue === undefined &&
              !values[f.name],
          )
          .map((f) => f.name),
  );
  if (issue.field) forced.add(issue.field);
  const conditionValues = Object.fromEntries(
    fields.map((f) => [
      f.name,
      !item && values[f.name] === "" && f.defaultValue !== undefined
        ? inputValue(f, { [f.name]: f.defaultValue })
        : values[f.name],
    ]),
  );
  function showError(form: HTMLFormElement, message: string, field: string) {
    setMessage(message);
    setIssue((v) => ({ field, attempt: v.attempt + 1 }));
    window.requestAnimationFrame(() => {
      const block = field
        ? form.querySelector<HTMLElement>(`[data-form-field="${CSS.escape(field)}"]`)
        : form;
      block?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      block
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), [role="combobox"], button:not([disabled])',
        )
        ?.focus({ preventScroll: true });
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onSubmitAttempt?.();
    if (pending) return;
    if (uploading) {
      setMessage("Дождитесь загрузки файлов");
      return;
    }
    const missingChoice =
      !item &&
      writable.find(
        (field) =>
          (field.required || !field.nullable) &&
          field.defaultValue === undefined &&
          values[field.name] === "",
      );
    if (missingChoice) {
      showError(
        event.currentTarget,
        `Заполните поле ${missingChoice.presentation?.label || missingChoice.name}`,
        missingChoice.name,
      );
      return;
    }
    const changed = writable.filter((field) =>
      item ? values[field.name] !== inputValue(field, item) : values[field.name] !== "",
    );
    const invalid = [
      ...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea",
      ),
    ].find((el) => {
      const name = el.closest<HTMLElement>("[data-form-field]")?.dataset.formField;
      return !el.disabled && (!item || changed.some((f) => f.name === name)) && !el.checkValidity();
    });
    if (invalid) {
      showError(
        event.currentTarget,
        invalid.validationMessage,
        invalid.closest<HTMLElement>("[data-form-field]")?.dataset.formField ?? "",
      );
      return;
    }
    if (item && changed.length === 0 && !allowUnchanged) {
      setMessage("Нет изменений");
      return;
    }
    setMessage("");
    try {
      const payload: Record<string, ItemValue> = {};
      for (const field of changed) {
        try {
          payload[field.name] = payloadValue(field, values[field.name]);
          const repeater = field.presentation?.repeater;
          const rows = payload[field.name];
          if (field.presentation?.interface === "repeater" && repeater && rows !== null) {
            if (
              !Array.isArray(rows) ||
              rows.length < Math.max(repeater.minItems, field.required ? 1 : 0) ||
              rows.length > repeater.maxItems
            )
              throw new Error(
                `Нужно от ${Math.max(repeater.minItems, field.required ? 1 : 0)} до ${repeater.maxItems} элементов`,
              );
            for (const [index, row] of rows.entries()) {
              if (!row || typeof row !== "object" || Array.isArray(row))
                throw new Error(`Элемент ${index + 1} должен быть объектом`);
              for (const child of repeater.fields)
                if (
                  child.required &&
                  (row[child.name] == null ||
                    (typeof row[child.name] === "string" && !String(row[child.name]).trim()))
                )
                  throw new Error(`Элемент ${index + 1}: заполните ${child.label || child.name}`);
            }
          }
        } catch (cause) {
          showError(
            event.currentTarget,
            `${field.presentation?.label || field.name}: ${cause instanceof Error ? cause.message : "Проверьте значение"}`,
            field.name,
          );
          return;
        }
      }
      if (!item && primaryKey.type === "text") payload[primaryKey.name] = manualKey;
      await onSave(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Проверьте значения полей");
    }
  }

  return (
    <form
      id={id}
      noValidate
      onSubmit={submit}
      className={embedded ? "space-y-5" : "space-y-4 rounded-xl border bg-card p-5"}
    >
      {!embedded && (
        <h2 className="text-lg font-semibold">{item ? "Изменить запись" : "Новая запись"}</h2>
      )}
      {!item && primaryKey.type === "text" && (
        <div className="space-y-1">
          <Label htmlFor={`${formId}-manual-key`} className="font-mono">
            {primaryKey.name} *
          </Label>
          <Input
            id={`${formId}-manual-key`}
            value={manualKey}
            onChange={(event) => setManualKey(event.target.value)}
            required
            maxLength={255}
            disabled={pending}
            className="h-9 font-mono"
          />
          <p className="text-xs text-muted-foreground">Укажите уникальный строковый ключ записи.</p>
        </div>
      )}
      {formLayout && layoutHasConditions(formLayout) && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            disabled={pending}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? "Применить условия видимости" : "Показать все доступные поля"}
          </Button>
        </div>
      )}
      <ConfiguredFieldLayout
        key={issue.attempt}
        fields={fields}
        layout={formLayout}
        values={conditionValues}
        forced={forced}
        reveal={issue.field}
      >
        {(field) => (
          <>
            <Label
              htmlFor={`${formId}-${field.name}`}
              className={field.presentation?.label ? undefined : "font-mono"}
            >
              {field.presentation?.label || field.name}
              {!readOnlyFields.includes(field.name) &&
                (field.required || !field.nullable) &&
                field.defaultValue === undefined && (
                  <span aria-label="значение необходимо"> *</span>
                )}
              {field.type === "datetime" && !readOnlyFields.includes(field.name) && (
                <span className="ml-2 font-sans text-xs text-muted-foreground">UTC</span>
              )}
            </Label>
            {readOnlyFields.includes(field.name) && item ? (
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
                value={values[field.name]}
                catalog={catalog}
                creating={!item}
                onChange={(value) => {
                  setValues((current) => ({ ...current, [field.name]: value }));
                  if (field.relation?.kind === "m2o") onReferenceChange?.(field.name, value);
                }}
                onOpenRelated={onOpenRelated}
                onBusy={(busy) => {
                  setUploading(busy);
                  onBusyChange?.(busy);
                }}
                disabled={
                  pending || uploading || (preview && ["file", "files"].includes(field.type))
                }
                container={portalContainer}
                required={
                  !item && (field.required || !field.nullable) && field.defaultValue === undefined
                }
              />
            )}
            {field.presentation?.description && (
              <p
                id={`${formId}-${field.name}-help`}
                className="whitespace-pre-wrap text-xs text-muted-foreground"
              >
                {field.presentation.description}
              </p>
            )}
            {field.type === "datetime" && !readOnlyFields.includes(field.name) && (
              <p className="text-xs text-muted-foreground">
                Время UTC, без пересчёта из часового пояса устройства.
              </p>
            )}
            {!item && field.defaultValue !== undefined && (
              <p className="text-xs text-muted-foreground">
                По умолчанию:{" "}
                {field.presentation?.options?.find((option) => option.value === field.defaultValue)
                  ?.label ?? displayValue(field.defaultValue, field.type)}
              </p>
            )}
          </>
        )}
      </ConfiguredFieldLayout>
      {!hideActions && (
        <ItemFormActions
          fields={writable}
          pending={pending || uploading}
          creating={!item}
          onCancel={embedded ? undefined : onCancel}
        />
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
