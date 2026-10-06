"use client";

import { useLayoutEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import type { OpenRelated } from "./relation-picker";
import { formDraftPayload, FieldDraftError } from "./form-draft-payload";
import { ItemFormField } from "./item-form-field";
import { inputValue } from "./item-input-values";
import type { Collection, CollectionField, Item, ItemValue } from "./types";
import { ConfiguredFieldLayout } from "./configured-field-layout";
import { layoutHasConditions } from "./form-layout-model";
import type { FormLayout } from "./presentation-types";
import { ItemFormActions } from "./item-form-actions";
import type { ReactNode } from "react";
import {
  fieldIsRequired,
  fieldIsReadonly,
  changeFieldDraft,
  effectiveFieldDraft,
} from "./field-rule-draft";
import { useUiCopy } from "@/lib/ui-copy";

interface ItemFormProps {
  fields: CollectionField[];
  aliasFields?: CollectionField[];
  renderAlias?: (field: CollectionField) => ReactNode;
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
  aliasFields = [],
  renderAlias,
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
  const copy = useUiCopy();

  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        inputValue(field, { ...item, ...initialValues }),
      ]),
    ),
  );
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [manualKey, setManualKey] = useState(
    String(initialValues?.[primaryKey.name] ?? ""),
  );
  const [issue, setIssue] = useState({ field: "", attempt: 0 });
  const [showHidden, setShowHidden] = useState(false);
  const writable = fields.filter(
    (f) => !readOnlyFields.includes(f.name) && !fieldIsReadonly(f),
  );
  const changedCount =
    writable.filter((field) =>
      item
        ? values[field.name] !== inputValue(field, item)
        : values[field.name] !== "",
    ).length + (!item && manualKey ? 1 : 0);
  useLayoutEffect(() => {
    onDirtyChange?.(changedCount);
  }, [changedCount, onDirtyChange]);
  const conditionValues = effectiveFieldDraft(
    fields,
    values,
    Boolean(item),
    initialValues,
  );
  const forced = new Set(
    showHidden
      ? fields.map((f) => f.name)
      : writable
          .filter(
            (f) =>
              !item &&
              fieldIsRequired(f, conditionValues) &&
              f.defaultValue === undefined &&
              !values[f.name],
          )
          .map((f) => f.name),
  );
  if (issue.field) forced.add(issue.field);
  function showError(form: HTMLFormElement, message: string, field: string) {
    setMessage(message);
    setIssue((v) => ({ field, attempt: v.attempt + 1 }));
    window.requestAnimationFrame(() => {
      const block = field
        ? form.querySelector<HTMLElement>(
            `[data-form-field="${CSS.escape(field)}"]`,
          )
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
      setMessage(copy("Дождитесь загрузки файлов"));
      return;
    }
    const missingChoice = writable.find(
      (field) =>
        fieldIsRequired(field, conditionValues) &&
        conditionValues[field.name]?.trim() === "",
    );
    if (missingChoice) {
      showError(
        event.currentTarget,
        copy("Заполните поле {{value0}}", {
          value0: missingChoice.presentation?.label || missingChoice.name,
        }),
        missingChoice.name,
      );
      return;
    }
    const changed = writable.filter((field) =>
      item
        ? values[field.name] !== inputValue(field, item)
        : values[field.name] !== "",
    );
    const invalid = [
      ...event.currentTarget.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >("input, textarea"),
    ].find((el) => {
      const name =
        el.closest<HTMLElement>("[data-form-field]")?.dataset.formField;
      return (
        !el.disabled &&
        (!item || changed.some((f) => f.name === name)) &&
        !el.checkValidity()
      );
    });
    if (invalid) {
      showError(
        event.currentTarget,
        invalid.validationMessage,
        invalid.closest<HTMLElement>("[data-form-field]")?.dataset.formField ??
          "",
      );
      return;
    }
    if (item && changed.length === 0 && !allowUnchanged) {
      setMessage(copy("Нет изменений"));
      return;
    }
    setMessage("");
    try {
      const payload = formDraftPayload(changed, values, copy);
      if (!item && primaryKey.type === "text")
        payload[primaryKey.name] = manualKey;
      await onSave(payload);
    } catch (error) {
      if (error instanceof FieldDraftError) {
        showError(event.currentTarget, error.message, error.field);
        return;
      }
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Проверьте значения полей"),
      );
    }
  }

  return (
    <form
      id={id}
      noValidate
      onSubmit={submit}
      className={
        embedded ? "space-y-5" : "space-y-4 rounded-xl border bg-card p-5"
      }
    >
      {!embedded && (
        <h2 className="text-lg font-semibold">
          {item ? copy("Изменить запись") : copy("Новая запись")}
        </h2>
      )}
      {!item && primaryKey.type === "text" && (
        <div className="space-y-1">
          <Label
            htmlFor={`${formId}-manual-key`}
            className="font-mono"
          >
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
          <p className="text-xs text-muted-foreground">
            {copy("Укажите уникальный строковый ключ записи. ")}
          </p>
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
            {showHidden
              ? copy("Применить условия видимости")
              : copy("Показать все доступные поля")}
          </Button>
        </div>
      )}
      <ConfiguredFieldLayout
        key={issue.attempt}
        fields={[
          ...fields.filter(
            (f) => !f.presentation?.rules?.hidden || forced.has(f.name),
          ),
          ...aliasFields.filter(
            (f) => !f.presentation?.rules?.hidden || forced.has(f.name),
          ),
        ]}
        layout={formLayout}
        values={conditionValues}
        forced={forced}
        reveal={issue.field}
      >
        {(field) =>
          field.type === "alias" ? (
            (renderAlias?.(field) ?? (
              <p className="text-xs text-muted-foreground">
                {copy("Связанные записи появятся после сохранения. ")}
              </p>
            ))
          ) : (
            <ItemFormField
              field={field}
              item={item}
              formId={formId}
              readonly={
                readOnlyFields.includes(field.name) || fieldIsReadonly(field)
              }
              required={fieldIsRequired(field, conditionValues)}
              value={values[field.name]}
              draftValues={conditionValues}
              catalog={catalog}
              onOpenRelated={onOpenRelated}
              container={portalContainer}
              disabled={
                pending ||
                uploading ||
                (preview && ["file", "files"].includes(field.type))
              }
              onBusy={(busy) => {
                setUploading(busy);
                onBusyChange?.(busy);
              }}
              onChange={(value) => {
                const next = changeFieldDraft(
                  fields,
                  values,
                  field.name,
                  value,
                );
                setValues(next);
                for (const candidate of fields) {
                  if (
                    candidate.relation?.kind === "m2o" &&
                    next[candidate.name] !== values[candidate.name]
                  ) {
                    onReferenceChange?.(candidate.name, next[candidate.name]);
                  }
                }
              }}
            />
          )
        }
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
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
    </form>
  );
}
