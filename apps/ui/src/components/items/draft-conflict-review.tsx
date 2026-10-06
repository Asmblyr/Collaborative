"use client";

import { useEffect, useRef, useState } from "react";
import { Check, GitCompareArrows } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { cn } from "@/lib/utils";
import { displayValue } from "./item-display";
import type { Collection } from "./types";
import type { ConflictChoices, DraftConflict } from "./draft-conflicts";
import { useUiCopy } from "@/lib/ui-copy";

export function DraftConflictReview({
  conflicts,
  catalog,
  onApply,
}: {
  conflicts: DraftConflict[];
  catalog: Collection[];
  onApply: (choices: ConflictChoices) => void;
}) {
  const copy = useUiCopy();

  const [choices, setChoices] = useState<ConflictChoices>({});
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "nearest" });
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label={copy("Конфликт изменений")}
      className="space-y-4 rounded-lg border p-4 outline-none"
    >
      <div className="space-y-1">
        <p
          role="alert"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <GitCompareArrows className="size-4 shrink-0" />{" "}
          {copy(" Запись изменилась ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {conflicts.length
            ? copy(
                "Выберите значения для совпавших полей. Остальные изменения остались в черновике.",
              )
            : copy(
                "Актуальные значения загружены. Ваши изменения остались в черновике.",
              )}
        </p>
      </div>
      {conflicts.map((conflict) => {
        const collection = catalog.find(
          (entry) => entry.name === conflict.target.collection,
        );
        const field = collection?.fields.find(
          (entry) => entry.name === conflict.field,
        );
        const label = field?.presentation?.label || conflict.field;
        const reference = conflict.target.draft.references?.[conflict.field];
        return (
          <div
            key={conflict.key}
            className="space-y-2"
          >
            <p className="text-xs font-medium">
              {conflict.target.path !== "root" &&
                `${conflict.target.draft.label || collection?.displayName || conflict.target.collection} · `}
              {label}
            </p>
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="group"
              aria-label={label}
            >
              {(["mine", "current"] as const).map((choice) => (
                <Button
                  key={choice}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={choices[conflict.key] === choice}
                  onClick={() =>
                    setChoices((current) => ({
                      ...current,
                      [conflict.key]: choice,
                    }))
                  }
                  className={cn(
                    "h-auto min-w-0 flex-col items-stretch px-3 py-2 text-left text-sm font-normal whitespace-normal",
                    choices[conflict.key] === choice &&
                      "border-foreground/40 bg-accent",
                  )}
                >
                  <span className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    {choice === "mine"
                      ? copy("Ваше значение")
                      : copy("Актуальное")}
                    {choices[conflict.key] === choice && (
                      <Check className="size-3" />
                    )}
                  </span>
                  <span className="block max-h-24 overflow-auto whitespace-pre-wrap break-words">
                    {choice === "mine" && reference
                      ? reference.label || copy("Новая запись")
                      : displayValue(
                          choice === "mine" ? conflict.mine : conflict.current,
                          field?.type ?? "text",
                          copy,
                        )}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        disabled={conflicts.some((conflict) => !choices[conflict.key])}
        onClick={() => onApply(choices)}
      >
        {copy("Продолжить редактирование ")}
      </Button>
    </section>
  );
}
