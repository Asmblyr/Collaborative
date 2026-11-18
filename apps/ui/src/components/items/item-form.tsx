"use client";

import {
  useLayoutEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import type { OpenRelated } from "./relation-picker";
import { ItemFormField } from "./item-form-field";
import { inputValue } from "./item-input-values";
import type { Collection, CollectionField, Item, ItemValue } from "./types";
import { ConfiguredFieldLayout } from "./configured-field-layout";
import { layoutHasConditions } from "./form-layout-model";
import type { FormLayout } from "./presentation-types";
import { ItemFormActions } from "./item-form-actions";
import {
  fieldIsRequired,
  fieldIsReadonly,
  changeFieldDraft,
  effectiveFieldDraft,
} from "./field-rule-draft";
import {
  changedFieldCount,
  focusFormField,
  forcedVisibleFieldNames,
  submitItemFormDraft,
} from "./item-form-draft";
import { useUiCopy } from "@/lib/ui-copy";

interface ItemFormProps {
  fields: CollectionField[];
  aliasFields?: CollectionField[];
  renderAlias?: (field: CollectionField) => ReactNode;
  formLayout?: FormLayout | null;
  plainGroups?: boolean;
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
  onSave: (
    values: Record<string, ItemValue>,
    keepOpen?: boolean,
  ) => Promise<void>;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (count: number) => void;
  onSubmitAttempt?: () => void;
  initialValues?: Item;
  allowUnchanged?: boolean;
  onReferenceChange?: (field: string, value: string) => void;
  onFieldFocus?: (field: string) => void;
  onFieldBlur?: (field: string) => void;
  fieldHolders?: Record<string, string>;
}

export function ItemForm({
  fields,
  aliasFields = [],
  renderAlias,
  formLayout,
  plainGroups = false,
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
  onFieldFocus,
  onFieldBlur,
  fieldHolders,
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
    (field) => !readOnlyFields.includes(field.name) && !fieldIsReadonly(field),
  );
  const changedCount = changedFieldCount(writable, values, item, manualKey);
  useLayoutEffect(() => {
    onDirtyChange?.(changedCount);
  }, [changedCount, onDirtyChange]);
  const conditionValues = effectiveFieldDraft(
    fields,
    values,
    Boolean(item),
    initialValues,
  );
  const forced = forcedVisibleFieldNames({
    fields,
    writable,
    values,
    conditionValues,
    item,
    showHidden,
    issueField: issue.field,
  });

  function showError(form: HTMLFormElement, errorText: string, field: string) {
    setMessage(errorText);
    setIssue((prev) => ({ field, attempt: prev.attempt + 1 }));
    focusFormField(form, field);
  }

  return (
    <form
      id={id}
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) =>
        submitItemFormDraft({
          event,
          pending,
          uploading,
          writable,
          conditionValues,
          values,
          item,
          allowUnchanged,
          primaryKey,
          manualKey,
          copy,
          onSubmitAttempt,
          onSave,
          showError,
          setMessage,
        })
      }
      onFocusCapture={(event) => {
        const field = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-form-field]",
        )?.dataset.formField;
        if (field && writable.some((entry) => entry.name === field)) {
          onFieldFocus?.(field);
        }
      }}
      onBlurCapture={(event) => {
        const field = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-form-field]",
        )?.dataset.formField;
        const next = (
          event.relatedTarget as HTMLElement | null
        )?.closest<HTMLElement>("[data-form-field]")?.dataset.formField;
        if (field && field !== next) {
          onFieldBlur?.(field);
        }
      }}
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
            {copy("Укажите уникальный строковый ключ записи.")}
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
        fields={[
          ...fields.filter(
            (field) =>
              !field.presentation?.rules?.hidden || forced.has(field.name),
          ),
          ...aliasFields.filter(
            (field) =>
              !field.presentation?.rules?.hidden || forced.has(field.name),
          ),
        ]}
        layout={formLayout}
        plainGroups={plainGroups}
        values={conditionValues}
        forced={forced}
        reveal={issue.field}
        revealAttempt={issue.attempt}
      >
        {(field) =>
          field.type === "alias" ? (
            (renderAlias?.(field) ?? (
              <p className="text-xs text-muted-foreground">
                {copy("Связанные записи появятся после сохранения.")}
              </p>
            ))
          ) : (
            <ItemFormField
              holder={fieldHolders?.[field.name]}
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
                onDirtyChange?.(
                  changedFieldCount(writable, next, item, manualKey),
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
