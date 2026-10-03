import { LoaderCircle, Plus, Save } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import type { CollectionField } from "./types";

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
  const Icon = pending ? LoaderCircle : creating ? Plus : Save;
  return (
    <div className="flex items-center justify-between gap-3">
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Отмена
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
        <Icon aria-hidden="true" className={pending ? "animate-spin" : undefined} />
        {pending ? "Сохраняем…" : (label ?? (creating ? "Создать запись" : "Сохранить"))}
      </Button>
    </div>
  );
}