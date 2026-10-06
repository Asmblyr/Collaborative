"use client";

import { Paperclip, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { displayValue } from "./item-display";
import type { ItemValue } from "./types";
import type { ItemColumn } from "./use-item-columns";
import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";
import { safeContentUrl } from "./content-value";
import Markdown from "react-markdown";
import { PresentedValue } from "./presented-value";
import { TagsValue } from "./tags-value";
import { PluginFieldDisplay } from "@/components/plugins/field-display";
import { useUiCopy } from "@/lib/ui-copy";

export function compactKey(value: string): string {
  return /^[\da-f]{8}-[\da-f-]{27}$/i.test(value)
    ? `${value.slice(0, 8)}…${value.slice(-4)}`
    : value;
}

export function ItemTableValue({
  column,
  value,
  primary,
  emphasized,
  relationLabel,
}: {
  column: ItemColumn;
  value: ItemValue;
  primary: boolean;
  emphasized: boolean;
  relationLabel?: string;
}) {
  const copy = useUiCopy();

  if (column.presentation?.sensitive) {
    return (
      <span aria-label={copy("Чувствительное значение")}>
        {value == null || value === "" ? "—" : "••••••••"}
      </span>
    );
  }
  const options = column.presentation?.options;
  const text =
    column.presentation?.interface === "richtext" && typeof value === "string"
      ? decodeHTML(
          sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }),
        )
      : options
        ? Array.isArray(value)
          ? value
              .map(
                (v) => options.find((o) => o.value === v)?.label || String(v),
              )
              .join(", ")
          : options.find((o) => o.value === value)?.label ||
            displayValue(value, column.type, copy)
        : displayValue(value, column.type, copy);
  if (value === null || value === undefined)
    return <span className="text-muted-foreground/70">—</span>;
  if (column.presentation?.interface === "tags") {
    return (
      <TagsValue
        value={value}
        limit={3}
      />
    );
  }
  if (column.presentation?.extension) {
    return (
      <PluginFieldDisplay
        extension={column.presentation.extension}
        type={column.type}
        value={value}
        fallback={
          <span
            className="block truncate"
            title={text}
          >
            {text}
          </span>
        }
      />
    );
  }
  if (column.presentation?.display)
    return (
      <PresentedValue
        value={value}
        display={column.presentation.display}
      />
    );
  if (column.presentation?.interface === "repeater" && Array.isArray(value))
    return (
      <span className="text-sm text-muted-foreground">
        {copy("Элементов: ")}
        {value.length}
      </span>
    );
  if (
    column.presentation?.interface === "markdown" &&
    typeof value === "string"
  )
    return (
      <div className="line-clamp-1 text-sm">
        <Markdown
          skipHtml
          allowedElements={["strong", "em", "s", "code"]}
          unwrapDisallowed
        >
          {value}
        </Markdown>
      </div>
    );
  if (
    column.presentation?.interface === "url" &&
    typeof value === "string" &&
    safeContentUrl(value)
  )
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate text-primary underline"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </a>
    );
  if (column.type === "file" || column.type === "files")
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <Paperclip className="size-3.5" />
        {Array.isArray(value)
          ? copy("Файлов: {{value0}}", { value0: value.length })
          : copy("Файл")}
      </span>
    );
  if (column.type === "boolean")
    return <Badge variant={value ? "secondary" : "outline"}>{text}</Badge>;
  if (column.relation)
    return (
      <span
        className="flex min-w-0 items-center gap-2 text-muted-foreground"
        title={relationLabel ? `${relationLabel} (${text})` : text}
      >
        <Link2
          aria-hidden="true"
          className="size-3.5 shrink-0"
        />
        <span className="truncate">{relationLabel ?? compactKey(text)}</span>
      </span>
    );
  return (
    <span
      title={text}
      className={`block truncate ${
        primary
          ? "font-mono text-xs text-muted-foreground"
          : emphasized
            ? "font-medium"
            : column.type === "datetime"
              ? "text-xs text-muted-foreground"
              : column.type === "integer"
                ? "tabular-nums"
                : ""
      }`}
    >
      {primary ? compactKey(text) : text}
    </span>
  );
}
