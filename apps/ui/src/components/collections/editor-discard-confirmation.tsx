"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@asmblyr/kit/ui/button";

export function EditorDiscardConfirmation({
  onContinue,
  onDiscard,
}: {
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const id = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center sm:p-6">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="w-full max-w-md space-y-5 rounded-xl border bg-card p-5 shadow-xl"
      >
        <div className="space-y-2">
          <h3
            id={`${id}-title`}
            className="text-base font-semibold"
          >
            Закрыть без сохранения?
          </h3>
          <p
            id={`${id}-description`}
            className="text-sm leading-relaxed text-muted-foreground"
          >
            Ваши несохранённые изменения будут потеряны.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
          >
            Не сохранять
          </Button>
          <Button
            ref={continueRef}
            type="button"
            onClick={onContinue}
          >
            Продолжить редактирование
          </Button>
        </div>
      </section>
    </div>
  );
}
