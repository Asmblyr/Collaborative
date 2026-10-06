"use client";

import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { FileField } from "@/components/files/file-field";
import { useFileLibraryAccess } from "@/components/files/file-access";
import { RelationPicker, type OpenRelated } from "./relation-picker";
import { arrayDraft } from "./item-input-values";
import type { Collection, CollectionField } from "./types";
import { MarkdownEditor, RichTextEditor } from "./content-editor";
import { RepeaterInput } from "./repeater-input";
import { TagsInput } from "./tags-input";
import { UrlFieldInput } from "./url-field-input";
import { PresentedValue } from "./presented-value";
import { useUiCopy } from "@/lib/ui-copy";

export function BuiltinFieldInput({
  field,
  value,
  onChange,
  id,
  catalog,
  disabled,
  required,
  container,
  onOpenRelated,
  onBusy,
  creating = false,
  draftValues = {},
}: {
  field: CollectionField;
  value: string;
  onChange: (value: string) => void;
  id: string;
  catalog: Collection[];
  disabled: boolean;
  required?: boolean;
  container?: HTMLElement | null;
  onOpenRelated?: OpenRelated;
  onBusy?: (busy: boolean) => void;
  creating?: boolean;
  draftValues?: Record<string, string>;
}) {
  const copy = useUiCopy();

  const presentation = field.presentation;
  const canChooseFiles = useFileLibraryAccess();
  if (presentation?.sensitive)
    return (
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value}
        disabled={disabled}
        required={required}
        className="h-9"
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (presentation?.interface === "repeater" && presentation.repeater)
    return (
      <RepeaterInput
        id={id}
        value={value}
        settings={presentation.repeater}
        disabled={disabled}
        onChange={onChange}
        container={container}
      />
    );
  if (presentation?.interface === "url") {
    return (
      <UrlFieldInput
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={presentation.placeholder || undefined}
        descriptionId={presentation.description ? `${id}-help` : undefined}
        onChange={onChange}
      />
    );
  }
  if (presentation?.interface === "tags") {
    return (
      <TagsInput
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        label={presentation.label || field.name}
        placeholder={presentation.placeholder}
        descriptionId={presentation.description ? `${id}-help` : undefined}
      />
    );
  }
  if (presentation?.interface === "markdown")
    return (
      <MarkdownEditor
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={presentation.placeholder}
        onChange={onChange}
      />
    );
  if (presentation?.interface === "richtext")
    return (
      <RichTextEditor
        id={id}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  if (field.type === "file" || field.type === "files")
    return (
      <FileField
        value={value}
        multiple={field.type === "files"}
        canChoose={canChooseFiles}
        disabled={disabled}
        onChange={onChange}
        container={container}
        onBusy={onBusy}
      />
    );
  if (field.type === "relation")
    return (
      <RelationPicker
        field={field}
        draftValues={draftValues}
        catalog={catalog}
        onOpen={onOpenRelated}
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        portalContainer={container}
      />
    );
  if (presentation?.interface === "multiselect") {
    const chosen = arrayDraft(value);
    const options = presentation.options ?? [];
    return (
      <div
        id={id}
        role="group"
        aria-label={presentation.label || field.name}
        className="space-y-2 rounded-lg border p-3"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              checked={chosen.includes(String(option.value))}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(
                  JSON.stringify(
                    checked
                      ? [...chosen, option.value]
                      : chosen.filter((v) => v !== option.value),
                  ),
                )
              }
            />
            {option.label}
          </label>
        ))}
        {chosen
          .filter((v) => !options.some((o) => o.value === v))
          .map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Checkbox
                checked
                disabled={disabled}
                onCheckedChange={() =>
                  onChange(
                    JSON.stringify(chosen.filter((entry) => entry !== v)),
                  )
                }
              />
              {v} {copy(" (архивный вариант) ")}
            </label>
          ))}
      </div>
    );
  }
  if (field.type === "boolean" || presentation?.interface === "select") {
    const options =
      field.type === "boolean"
        ? [
            { value: "true", label: copy("Да") },
            { value: "false", label: copy("Нет") },
          ]
        : (presentation?.options ?? []);
    const defaultOption = creating
      ? options.find(
          (option) => String(option.value) === String(field.defaultValue),
        )
      : undefined;
    return (
      <Select
        value={value ? `v:${value}` : "unset"}
        onValueChange={(v) => onChange(v === "unset" ? "" : v.slice(2))}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={presentation?.label || field.name}
          className="h-9 w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          <SelectItem value="unset">
            {defaultOption
              ? copy("{{value0}} (по умолчанию)", {
                  value0: defaultOption.label,
                })
              : required
                ? copy("Выберите значение")
                : copy("Не задано")}
          </SelectItem>
          {value && !options.some((o) => String(o.value) === value) && (
            <SelectItem value={`v:${value}`}>
              {value} {copy(" (архивный вариант) ")}
            </SelectItem>
          )}
          {options.map((o) => (
            <SelectItem
              key={o.value}
              value={`v:${o.value}`}
            >
              {presentation?.display?.kind === "status" ? (
                <PresentedValue
                  value={o.value}
                  display={presentation.display}
                />
              ) : (
                o.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "json" || presentation?.interface === "textarea")
    return (
      <Textarea
        id={id}
        aria-label={presentation?.label || field.name}
        value={value}
        disabled={disabled}
        placeholder={
          presentation?.placeholder ||
          (field.type === "json" ? '{"key": "value"}' : undefined)
        }
        rows={5}
        required={required}
        className={field.type === "json" ? "font-mono text-xs" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <Input
      id={id}
      aria-label={presentation?.label || field.name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      required={required}
      placeholder={presentation?.placeholder}
      aria-describedby={presentation?.description ? `${id}-help` : undefined}
      type={
        field.type === "date"
          ? "date"
          : field.type === "datetime"
            ? "datetime-local"
            : field.type === "integer"
              ? "number"
              : field.type === "email"
                ? "email"
                : "text"
      }
      inputMode={
        field.type === "bigint"
          ? "numeric"
          : field.type === "decimal"
            ? "decimal"
            : undefined
      }
      maxLength={
        field.type === "email" ? 254 : field.type === "uuid" ? 36 : undefined
      }
      pattern={
        field.type === "uuid"
          ? "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          : undefined
      }
      step={
        field.type === "integer" || field.type === "datetime" ? 1 : undefined
      }
      min={field.type === "integer" ? -2147483648 : undefined}
      max={field.type === "integer" ? 2147483647 : undefined}
      className="h-9"
    />
  );
}
