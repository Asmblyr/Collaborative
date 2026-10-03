"use client";

import { describeFilter } from "./item-filter-description";
import { Search, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { removeFilterNode } from "./item-filter-model";
import { filterFields, readFilter } from "./item-filter-options";
import type { Collection } from "./types";

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
  if (!q && !filter) return null;
  const group = readFilter(filter);
  const nodes = group.logic === "or" && group.children.length ? [group] : group.children;
  const fields = filterFields(collection, catalog);
  const labels = new Map(fields.map((field) => [field.name, field.label]));
  const choices = new Map(fields.map((field) => [field.name, field.options ?? []]));
  return (
    <div
      aria-label="Применённые условия"
      className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3"
    >
      {q && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 max-w-full text-xs font-normal"
          title={`Поиск: ${q}`}
          aria-label={`Убрать поиск: ${q}`}
          onClick={() => onChange(filter, "")}
        >
          <Search aria-hidden="true" className="size-3" />
          <span className="truncate">{q}</span>
          <X aria-hidden="true" className="size-3" />
        </Button>
      )}
      {q && group.children.length > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">И</span>
      )}
      {nodes.map((node, index) => {
        const label = describeFilter(node, labels, choices);
        return (
          <span key={index} className="flex max-w-full items-center gap-2">
            {index > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {group.logic === "and" ? "И" : "ИЛИ"}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 min-w-0 max-w-md text-xs font-normal"
              title={label}
              aria-label={`Убрать условие: ${label}`}
              onClick={() => {
                const next =
                  group.logic === "or"
                    ? { logic: "and" as const, children: [] }
                    : removeFilterNode(group, [index]);
                onChange(next.children.length ? JSON.stringify(next) : "", q);
              }}
            >
              <span className="truncate">{label}</span>
              <X aria-hidden="true" className="size-3 shrink-0" />
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
        Сбросить всё
      </Button>
    </div>
  );
}
