"use client";

import { describeFilter } from "./item-filter-description";
import { Search, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { removeFilterNode } from "./item-filter-model";
import { filterFields, readFilter } from "./item-filter-options";
import type { Collection } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFilterSummary({
  collection,
  catalog,
  q,
  filter,
  onChange,
}: {
  collection: Collection;
  catalog: Collection[];
  q: string;
  filter: string;
  onChange: (filter: string, query: string) => void;
}) {
  const copy = useUiCopy();

  if (!q && !filter) return null;
  const group = readFilter(filter);
  const nodes =
    group.logic === "or" && group.children.length ? [group] : group.children;
  const fields = filterFields(collection, catalog);
  const labels = new Map(fields.map((field) => [field.name, field.label]));
  const choices = new Map(
    fields.map((field) => [field.name, field.options ?? []]),
  );
  return (
    <div
      aria-label={copy("Применённые условия")}
      className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3"
    >
      {q && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 max-w-full text-xs font-normal"
          title={copy("Поиск: {{value0}}", { value0: q })}
          aria-label={copy("Убрать поиск: {{value0}}", { value0: q })}
          onClick={() => onChange(filter, "")}
        >
          <Search
            aria-hidden="true"
            className="size-3"
          />
          <span className="truncate">{q}</span>
          <X
            aria-hidden="true"
            className="size-3"
          />
        </Button>
      )}
      {q && group.children.length > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">
          {copy("И")}
        </span>
      )}
      {nodes.map((node, index) => {
        const label = describeFilter(node, labels, choices, copy);
        return (
          <span
            key={index}
            className="flex max-w-full items-center gap-2"
          >
            {index > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {group.logic === "and" ? copy("И") : copy("ИЛИ")}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 min-w-0 max-w-md text-xs font-normal"
              title={label}
              aria-label={copy("Убрать условие: {{value0}}", { value0: label })}
              onClick={() => {
                const next =
                  group.logic === "or"
                    ? { logic: "and" as const, children: [] }
                    : removeFilterNode(group, [index]);
                onChange(next.children.length ? JSON.stringify(next) : "", q);
              }}
            >
              <span className="truncate">{label}</span>
              <X
                aria-hidden="true"
                className="size-3 shrink-0"
              />
            </Button>
          </span>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-7 text-xs text-muted-foreground"
        onClick={() => onChange("", "")}
      >
        {copy("Сбросить всё ")}
      </Button>
    </div>
  );
}
