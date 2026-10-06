"use client";

import { ArrowUpRight, Unlink } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { resolveRelationChoiceFilter } from "@asmblyr-collaborative/contracts";
import { RecordChooser } from "./record-chooser";
import type { Collection, CollectionField } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export type OpenRelated = (
  collection: string,
  id?: string,
  onCreated?: (id: string) => void,
  field?: string,
) => void;

export function RelationPicker({
  field,
  value,
  onChange,
  disabled,
  portalContainer,
  catalog,
  onOpen,
  id,
  draftValues = {},
}: {
  field: CollectionField;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
  catalog: Collection[];
  onOpen?: OpenRelated;
  id?: string;
  draftValues?: Record<string, string>;
}) {
  const copy = useUiCopy();

  const target = catalog.find(
    (entry) => entry.name === field.relation?.collection,
  );
  if (!target?.access.read)
    return (
      <div className="space-y-1.5">
        <p className="break-all text-sm text-muted-foreground">
          {value || copy("Не задано")}{" "}
          {copy(" · Нет доступа к связанной коллекции ")}
        </p>
        {value && field.nullable && !field.required && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            {copy("Отвязать ")}
          </Button>
        )}
      </div>
    );
  const filter = field.presentation?.relationFilter
    ? resolveRelationChoiceFilter(
        field.presentation.relationFilter,
        draftValues,
      )
    : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <RecordChooser
            collection={target}
            catalog={catalog}
            title={field.presentation?.label || field.name}
            selected={value ? [value] : []}
            id={id}
            onChange={(ids) => onChange(ids[0] ?? "")}
            disabled={disabled || filter === null}
            candidateFilter={filter}
            portalContainer={portalContainer}
            onCreate={
              target.access.create && !target.profileExtension && onOpen
                ? () => onOpen(target.name, undefined, onChange, field.name)
                : undefined
            }
          />
        </div>
        {value && onOpen && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={copy("Открыть связанную запись {{value0}}", {
              value0: field.name,
            })}
            onClick={() => onOpen(target.name, value, undefined, field.name)}
          >
            <ArrowUpRight />
          </Button>
        )}
        {value && field.nullable && !field.required && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={copy("Отвязать {{value0}}", { value0: field.name })}
            onClick={() => onChange("")}
          >
            <Unlink className="size-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {target.displayName || target.name}
      </p>
    </div>
  );
}
