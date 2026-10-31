"use client";

import type { Ref } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

const SUPPORTED_FIELD_TYPES = [
  "text",
  "integer",
  "bigint",
  "date",
  "boolean",
  "datetime",
  "email",
  "relation",
  "decimal",
  "json",
  "uuid",
  "file",
  "files",
];

export function ItemFormActions({
  formId,
  fields,
  pending,
  creating = false,
  onCancel,
  disabled = false,
  label,
  saveStay,
  saveStayRef,
}: {
  formId?: string;
  fields: CollectionField[];
  pending: boolean;
  creating?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  label?: string;
  saveStay?: {
    label: string;
    disabled?: boolean;
  };
  saveStayRef?: Ref<HTMLButtonElement>;
}) {
  const copy = useUiCopy();

  const Icon = pending ? LoaderCircle : creating ? Plus : Save;
  const unsupportedField = fields.some(
    (field) => !SUPPORTED_FIELD_TYPES.includes(field.type),
  );
  return (
    <div className="flex items-center justify-between gap-3">
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена")}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {saveStay && (
          <Button
            ref={saveStayRef}
            type="submit"
            form={formId}
            variant="outline"
            data-keep-open="true"
            title="Ctrl+S"
            disabled={saveStay.disabled || pending || unsupportedField}
          >
            <Save aria-hidden="true" />
            {saveStay.label}
          </Button>
        )}
        <Button
          type="submit"
          form={formId}
          disabled={disabled || pending || unsupportedField}
        >
          <Icon
            aria-hidden="true"
            className={pending ? "animate-spin" : undefined}
          />
          {pending
            ? copy("Сохраняем…")
            : (label ??
              (creating ? copy("Создать запись") : copy("Сохранить")))}
        </Button>
      </div>
    </div>
  );
}
