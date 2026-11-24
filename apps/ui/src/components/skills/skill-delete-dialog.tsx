"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export function SkillDeleteDialog({
  open,
  skillTitle,
  skillSlug,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  skillTitle: string;
  skillSlug: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => cancelRef.current?.focus());
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className="fixed inset-0 m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-background/70 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) {
          onCancel();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) {
            onCancel();
          }
        }
      }}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <h3
            id={`${id}-title`}
            className="text-base font-semibold"
          >
            {copy("Удалить умение «{{value0}}»?", { value0: skillTitle })}
          </h3>
          <p
            id={`${id}-description`}
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {copy(
              "Умение /{{value0}} будет удалено безвозвратно. Оно сразу исчезнет из каталога ассистента и внешних MCP-клиентов.",
              { value0: skillSlug },
            )}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            {copy("Отмена")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? copy("Удаление…") : copy("Удалить умение")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
