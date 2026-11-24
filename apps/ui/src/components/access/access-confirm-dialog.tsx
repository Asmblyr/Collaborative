"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export function AccessConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
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
            {title}
          </h3>
          <p
            id={`${id}-description`}
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {description}
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
            {cancelLabel ?? copy("Отмена")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
