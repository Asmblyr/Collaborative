import type { FormEvent } from "react";
import type { useUiCopy } from "@/lib/ui-copy";
import { fieldIsRequired } from "./field-rule-draft";
import { FieldDraftError, formDraftPayload } from "./form-draft-payload";
import { inputValue } from "./item-input-values";
import type { Collection, CollectionField, Item, ItemValue } from "./types";

export function changedWritableFields(
  writable: CollectionField[],
  values: Record<string, string>,
  item: Item | undefined,
): CollectionField[] {
  return writable.filter((field) =>
    item
      ? values[field.name] !== inputValue(field, item)
      : values[field.name] !== "",
  );
}

export function changedFieldCount(
  writable: CollectionField[],
  candidateValues: Record<string, string>,
  item: Item | undefined,
  manualKey: string,
): number {
  const dirtyFields = changedWritableFields(writable, candidateValues, item);
  const manualKeyCount = !item && manualKey ? 1 : 0;
  return dirtyFields.length + manualKeyCount;
}

export function forcedVisibleFieldNames({
  fields,
  writable,
  values,
  conditionValues,
  item,
  showHidden,
  issueField,
}: {
  fields: CollectionField[];
  writable: CollectionField[];
  values: Record<string, string>;
  conditionValues: Record<string, string>;
  item: Item | undefined;
  showHidden: boolean;
  issueField: string;
}): Set<string> {
  const forced = new Set(
    showHidden
      ? fields.map((field) => field.name)
      : writable
          .filter(
            (field) =>
              !item &&
              fieldIsRequired(field, conditionValues) &&
              field.defaultValue === undefined &&
              !values[field.name],
          )
          .map((field) => field.name),
  );
  if (issueField) {
    forced.add(issueField);
  }
  return forced;
}

export function findInvalidFormElement(
  form: HTMLFormElement,
  item: Item | undefined,
  changed: CollectionField[],
): HTMLInputElement | HTMLTextAreaElement | undefined {
  return [
    ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  ].find((element) => {
    const name =
      element.closest<HTMLElement>("[data-form-field]")?.dataset.formField;
    return (
      !element.disabled &&
      (!item || changed.some((field) => field.name === name)) &&
      !element.checkValidity()
    );
  });
}

export function focusFormField(form: HTMLFormElement, field: string): void {
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

export async function submitItemFormDraft({
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
}: {
  event: FormEvent<HTMLFormElement>;
  pending: boolean;
  uploading: boolean;
  writable: CollectionField[];
  conditionValues: Record<string, string>;
  values: Record<string, string>;
  item: Item | undefined;
  allowUnchanged: boolean;
  primaryKey: Collection["primaryKey"];
  manualKey: string;
  copy: ReturnType<typeof useUiCopy>;
  onSubmitAttempt?: () => void;
  onSave: (
    values: Record<string, ItemValue>,
    keepOpen?: boolean,
  ) => Promise<void>;
  showError: (form: HTMLFormElement, errorText: string, field: string) => void;
  setMessage: (message: string) => void;
}): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  const form = event.currentTarget;
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  const keepOpen = submitter?.getAttribute("data-keep-open") === "true";
  onSubmitAttempt?.();
  if (pending) {
    return;
  }
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
      form,
      copy("Заполните поле {{value0}}", {
        value0: missingChoice.presentation?.label || missingChoice.name,
      }),
      missingChoice.name,
    );
    return;
  }
  const changed = changedWritableFields(writable, values, item);
  const invalid = findInvalidFormElement(form, item, changed);
  if (invalid) {
    showError(
      form,
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
    if (!item && primaryKey.type === "text") {
      payload[primaryKey.name] = manualKey;
    }
    await onSave(payload, keepOpen);
  } catch (error) {
    if (error instanceof FieldDraftError) {
      showError(form, error.message, error.field);
      return;
    }
    setMessage(
      error instanceof Error ? error.message : copy("Проверьте значения полей"),
    );
  }
}
