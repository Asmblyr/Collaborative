"use client";

import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

import { useId, type Ref } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";

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
  const { t, locale } = usePluginTranslations("comments");
  const inputId = useId();
  let submitLabel = editing ? t("save") : t("send");
  if (pending) {
    submitLabel = t("saving");
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
        {editing ? t("composer.edit") : t("composer.new")}
      </label>
      <Textarea
        ref={inputRef}
        id={inputId}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 resize-y"
        maxLength={maxLength}
        disabled={pending}
        placeholder={t("composer.placeholder")}
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
            ? `${text.length.toLocaleString(locale)} / ${maxLength.toLocaleString(locale)}`
            : t("composer.shortcut")}
        </span>
        <div className="flex gap-2">
          {editing && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onCancel}
            >
              {t("cancel")}
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
