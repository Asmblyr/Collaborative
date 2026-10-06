"use client";

import { useId, useState, type FormEvent } from "react";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { ItemFieldInput } from "./item-field-input";
import { payloadValue } from "./item-input-values";
import type { Collection, ItemValue } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemBulkDialog({
  collection,
  catalog,
  count,
  pending,
  onClose,
  onSave,
}: {
  collection: Collection;
  catalog: Collection[];
  count: number;
  pending: boolean;
  onClose: () => void;
  onSave: (
    values: Record<string, ItemValue>,
    close: () => void,
  ) => Promise<void>;
}) {
  const copy = useUiCopy();

  const formId = useId(),
    [enabled, setEnabled] = useState<Set<string>>(() => new Set());
  const [initialCount] = useState(count);
  const [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fields = collection.fields.filter(
    (f) =>
      f.type !== "alias" &&
      (collection.access.update?.includes("*") ||
        collection.access.update?.includes(f.name)),
  );
  async function submit(event: FormEvent, close: () => void) {
    event.preventDefault();
    if (uploading) return;
    setError("");
    try {
      await onSave(
        Object.fromEntries(
          fields
            .filter((f) => enabled.has(f.name))
            .map((f) => [f.name, payloadValue(f, values[f.name] ?? "", copy)]),
        ),
        close,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : copy("Не удалось изменить записи"),
      );
    }
  }
  return (
    <EditorDialog
      open
      busy={pending || uploading}
      title={copy("Изменить выбранные записи")}
      eyebrow={collection.displayName || collection.name}
      onClose={onClose}
      footer={(close) => (
        <div className="flex gap-2">
          <Button
            type="submit"
            form={formId}
            disabled={pending || uploading || !enabled.size}
          >
            {pending
              ? copy("Сохраняем…")
              : copy("Применить к {{value0}} записям", {
                  value0: initialCount,
                })}
          </Button>
          <Button
            variant="ghost"
            disabled={pending || uploading}
            onClick={close}
          >
            {copy("Отмена ")}
          </Button>
        </div>
      )}
    >
      {(container, close) => (
        <form
          id={formId}
          onSubmit={(event) => void submit(event, close)}
          className="space-y-5"
        >
          <p className="text-sm text-muted-foreground">
            {copy(
              "Отметьте поля, которые нужно заменить во всех выбранных записях. Остальные значения сохранятся. ",
            )}
          </p>
          {fields.map((field) => (
            <section
              key={field.name}
              className="space-y-3 rounded-xl border p-4"
            >
              <label className="flex items-center gap-3 text-sm font-medium">
                <Checkbox
                  disabled={pending || uploading}
                  checked={enabled.has(field.name)}
                  onCheckedChange={(checked) =>
                    setEnabled((current) => {
                      const next = new Set(current);
                      if (checked) next.add(field.name);
                      else next.delete(field.name);
                      return next;
                    })
                  }
                />
                {field.presentation?.label || field.name}
              </label>
              {enabled.has(field.name) && (
                <ItemFieldInput
                  id={`${formId}-${field.name}`}
                  field={field}
                  catalog={catalog}
                  value={values[field.name] ?? ""}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: value,
                    }))
                  }
                  container={container}
                  disabled={pending || uploading}
                  onBusy={setUploading}
                />
              )}
            </section>
          ))}
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(error)}
            </p>
          )}
        </form>
      )}
    </EditorDialog>
  );
}
