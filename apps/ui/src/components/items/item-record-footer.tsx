"use client";

import { useEffect, useRef } from "react";
import { LockKeyhole } from "lucide-react";
import { ItemFormActions } from "./item-form-actions";
import type { CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemRecordFooter({
  formId,
  editFields,
  relationChanges,
  recordDirty,
  hasDraftChanges,
  extensionsDirty,
  dirty,
  busy,
  draftMode,
  hasConflictReview,
}: {
  formId: string;
  editFields: CollectionField[];
  relationChanges: number;
  recordDirty: boolean;
  hasDraftChanges: boolean;
  extensionsDirty: boolean;
  dirty: boolean;
  busy: boolean;
  draftMode?: boolean;
  hasConflictReview: boolean;
}) {
  const copy = useUiCopy();
  const saveStayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (draftMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }

      const button = saveStayRef.current;
      const dialog = button?.closest("dialog");
      if (
        !button ||
        !dialog ||
        !(event.target instanceof Element) ||
        event.target.closest("dialog") !== dialog
      ) {
        return;
      }

      event.preventDefault();
      if (!button.disabled) {
        const form = document.getElementById(formId);
        if (form instanceof HTMLFormElement) {
          form.requestSubmit(button);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draftMode, formId]);

  const canSave = editFields.length > 0 || relationChanges > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        role="status"
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        {extensionsDirty ? (
          copy("Есть несохранённый текст на другой вкладке")
        ) : !canSave ? (
          <>
            <LockKeyhole className="size-3.5" />
            {copy("Только просмотр")}
          </>
        ) : dirty ? (
          <>
            <span className="size-1.5 rounded-full bg-amber-500" />
            {copy("Есть несохранённые изменения")}
          </>
        ) : (
          copy("Нет изменений")
        )}
      </p>
      {canSave && (
        <ItemFormActions
          formId={formId}
          fields={editFields}
          pending={busy}
          saveStayRef={saveStayRef}
          saveStay={
            !draftMode
              ? {
                  label: copy("Сохранить"),
                  disabled: hasConflictReview || !recordDirty,
                }
              : undefined
          }
          disabled={
            hasConflictReview ||
            extensionsDirty ||
            (!recordDirty && !(draftMode && hasDraftChanges))
          }
          label={
            draftMode
              ? copy("Применить к черновику")
              : copy("Сохранить всё и закрыть")
          }
        />
      )}
    </div>
  );
}
