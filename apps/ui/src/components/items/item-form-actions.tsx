"use client";

import { LoaderCircle, Plus, Save } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import type { CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFormActions({
  formId,
  fields,
  pending,
  creating = false,
  onCancel,
  disabled = false,
  label,
}: {
  formId?: string;
  fields: CollectionField[];
  pending: boolean;
  creating?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const copy = useUiCopy();

  const Icon = pending ? LoaderCircle : creating ? Plus : Save;
  return (
    <div className="flex items-center justify-between gap-3">
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена ")}
        </Button>
      )}
      <Button
        type="submit"
        form={formId}
        className="ml-auto"
        disabled={
          disabled ||
          pending ||
          fields.some(
            (field) =>
              ![
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
              ].includes(field.type),
          )
        }
      >
        <Icon
          aria-hidden="true"
          className={pending ? "animate-spin" : undefined}
        />
        {pending
          ? copy("Сохраняем…")
          : (label ?? (creating ? copy("Создать запись") : copy("Сохранить")))}
      </Button>
    </div>
  );
}
