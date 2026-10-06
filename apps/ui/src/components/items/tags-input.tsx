"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { parseTags, tagLimits } from "@asmblyr-collaborative/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { useUiCopy } from "@/lib/ui-copy";
import { tagErrorMessage, tagsDraft } from "./tag-values";

export function TagsInput({
  id,
  value,
  onChange,
  disabled,
  required,
  label,
  placeholder,
  descriptionId,
}: {
  id: string;
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  required?: boolean;
  label: string;
  placeholder?: string;
  descriptionId?: string;
}) {
  const copy = useUiCopy();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{
    base: string;
    text: string;
    payload: string;
  } | null>(null);
  const [error, setError] = useState("");
  // Keep the current input separate from committed chips, but include it in the
  // parent draft so Save is enabled and invalid text cannot be silently omitted.
  const activeDraft = draft?.payload === value ? draft : null;
  const pending = activeDraft?.text ?? "";
  const tags = tagsDraft(activeDraft?.base ?? value);
  const helpId = `${id}-tags-help`;
  const errorId = `${id}-tags-error`;
  const describedBy = [descriptionId, helpId, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  function validate(text: string, entries = tags ?? []) {
    let message = "";
    if (text) {
      try {
        parseTags([...entries, text]);
      } catch (cause) {
        message = tagErrorMessage(cause, copy);
      }
    }
    input.current?.setCustomValidity(message);
    setError(message);
    return !message;
  }

  function add() {
    if (disabled || !pending || !validate(pending) || tags === null) {
      return;
    }
    onChange(JSON.stringify(parseTags([...tags, pending])));
    setDraft(null);
    input.current?.setCustomValidity("");
  }

  if (tags === null) {
    return (
      <div className="space-y-2">
        <Textarea
          id={id}
          aria-label={label}
          aria-describedby={helpId}
          value={value}
          disabled={disabled}
          required={required}
          rows={4}
          className="font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
        <p
          id={helpId}
          className="text-xs text-muted-foreground"
        >
          {copy(
            "Исходное значение показано как JSON: исправьте список тегов или выберите другой редактор поля.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <div
        className={`flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 ${disabled ? "opacity-50" : ""}`}
      >
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="max-w-full min-w-0 gap-1 py-0.5 pl-2 pr-0.5 font-normal"
          >
            <span
              className="truncate"
              title={tag}
            >
              {tag}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={copy("Удалить тег {{value0}}", { value0: tag })}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const next = tags.filter((entry) => entry !== tag);
                const base = JSON.stringify(next);
                const payload = pending
                  ? JSON.stringify([...next, pending])
                  : base;
                setDraft(pending ? { base, text: pending, payload } : null);
                onChange(payload);
                validate(pending, next);
                input.current?.focus();
              }}
            >
              <X
                aria-hidden="true"
                className="size-3"
              />
            </Button>
          </Badge>
        ))}
        <Input
          ref={input}
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          value={pending}
          disabled={disabled}
          required={required && tags.length === 0}
          placeholder={placeholder || copy("Введите тег…")}
          className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => {
            const text = event.target.value;
            const base = activeDraft?.base ?? value;
            const payload = text ? JSON.stringify([...tags, text]) : base;
            setDraft(text ? { base, text, payload } : null);
            onChange(payload);
            validate(text);
          }}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
        />
      </div>
      <p
        id={helpId}
        className="text-xs text-muted-foreground"
      >
        {copy(
          "Enter — добавить тег. До {{value0}} тегов, по {{value1}} символов.",
          { value0: tagLimits.count, value1: tagLimits.length },
        )}
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
