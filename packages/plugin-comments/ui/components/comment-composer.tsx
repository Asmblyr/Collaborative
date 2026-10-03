"use client";

import { useId, type Ref } from "react";
import { Button } from "@asmblyr/kit/ui/button";
import { Textarea } from "@asmblyr/kit/ui/textarea";

interface CommentComposerProps {
  text: string;
  maxLength: number;
  editing: boolean;
  canSubmit: boolean;
  pending: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  onChange(text: string): void;
  onSubmit(): Promise<void>;
  onCancel(): void;
}

export function CommentComposer({
  text,
  maxLength,
  editing,
  canSubmit,
  pending,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const inputId = useId();
  let submitLabel = editing ? "Сохранить" : "Отправить";
  if (pending) {
    submitLabel = "Сохранение…";
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          void onSubmit();
        }
      }}
    >
      <label
        htmlFor={inputId}
        className="text-sm font-medium"
      >
        {editing ? "Изменить комментарий" : "Новый комментарий"}
      </label>
      <Textarea
        ref={inputRef}
        id={inputId}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 resize-y"
        maxLength={maxLength}
        disabled={pending}
        placeholder="Добавьте контекст, вопрос или заметку…"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            if (canSubmit) {
              void onSubmit();
            }
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {text.length
            ? `${text.length.toLocaleString("ru")} / ${maxLength.toLocaleString("ru")}`
            : "Ctrl / ⌘ + Enter — отправить"}
        </span>
        <div className="flex gap-2">
          {editing && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onCancel}
            >
              Отмена
            </Button>
          )}
          <Button
            type="submit"
            disabled={!canSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
