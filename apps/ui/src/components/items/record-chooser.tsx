"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { itemLabelField } from "./item-label";
import { useRelationItems } from "./use-relation-items";
import {
  recordChoiceColumns,
  recordChoicePresentation,
} from "./record-choice-presentation";
import { useTableRelationLabels } from "./use-table-relation-labels";
import { availableColumns } from "./item-columns";
import { RecordChooserContent } from "./record-chooser-content";
import { RecordChooserTrigger } from "./record-chooser-trigger";
import type { Collection, Item } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export interface RecordChoice {
  id: string;
  label: string;
  item: Item;
}

export function RecordChooser({
  collection,
  selected,
  onChange,
  multiple = false,
  disabled,
  portalContainer,
  onCreate,
  trigger,
  onApply,
  pending = false,
  id,
  actionError,
  labelField,
  catalog,
  title,
  previewColumns,
  candidatesEndpoint,
  candidateFilter,
  description,
  emptyMessage,
  excludedIds = [],
  onChoose,
  onClear,
}: {
  collection: Collection;
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  portalContainer?: HTMLElement | null;
  onCreate?: () => void;
  trigger?: ReactNode;
  onApply?: (choices: RecordChoice[]) => Promise<boolean>;
  onChoose?: (choice: RecordChoice) => void;
  onClear?: () => void;
  pending?: boolean;
  id?: string;
  actionError?: string;
  labelField?: string;
  catalog: Collection[];
  title?: string;
  previewColumns?: string[];
  candidatesEndpoint?: string;
  candidateFilter?:
    | import("@asmblyr-collaborative/contracts").ItemFilterGroup
    | null;
  description?: string;
  emptyMessage?: string;
  excludedIds?: string[];
}) {
  const copy = useUiCopy();
  const [open, setOpen] = useState(false);
  const items = useRelationItems(
    collection.name,
    collection.primaryKey.name,
    labelField ?? itemLabelField(collection),
    selected,
    open,
    labelField ? null : collection.displayTemplate,
    candidatesEndpoint,
    !labelField,
    candidateFilter,
  );
  const columns = recordChoiceColumns(collection, catalog, previewColumns);
  const relationLabels = useTableRelationLabels(
    catalog,
    items.records,
    columns,
  );
  const presentation = new Map(
    items.records.map((item) => {
      const recordId = String(item[collection.primaryKey.name]);
      const view = recordChoicePresentation(
        collection,
        item,
        columns,
        relationLabels,
        labelField,
      );
      const label = items.labels.get(recordId);
      return [
        recordId,
        label !== undefined
          ? {
              ...view,
              label,
              selectedLabel:
                label + view.selectedLabel.slice(view.label.length),
            }
          : view,
      ];
    }),
  );
  const selectedLabel = (value: string) =>
    presentation.get(value)?.selectedLabel ?? items.labels.get(value) ?? value;
  const statusField = availableColumns(collection).find(
    (column) => column.presentation?.display?.kind === "status",
  );
  const options = items.options.filter(
    (option) => !excludedIds.includes(option.id),
  );
  const heading = title || collection.displayName || collection.name;

  function toggle(value: string) {
    if (!multiple) {
      if (onChoose) {
        onChoose({
          id: value,
          label: selectedLabel(value),
          item:
            items.records.find(
              (row) => String(row[collection.primaryKey.name]) === value,
            ) ?? {},
        });
      } else {
        onChange([value]);
      }
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
        }
      }}
    >
      <RecordChooserTrigger
        id={id}
        collectionName={collection.name}
        fieldLabel={heading}
        label={
          selected.length
            ? selectedLabel(selected[0])
            : copy("Выберите запись…")
        }
        selected={selected.length > 0}
        disabled={disabled || pending}
        trigger={trigger}
        onClear={onClear}
      />
      <PopoverContent
        container={portalContainer}
        align="start"
        sideOffset={6}
        aria-label={
          title
            ? copy("Выбор: {{value0}}", { value0: title })
            : copy("Выбор записей {{value0}}", { value0: collection.name })
        }
        className="w-[min(32rem,calc(100vw-3rem))] overflow-hidden p-0"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) {
            setOpen(false);
          }
        }}
      >
        <RecordChooserContent
          heading={heading}
          description={description}
          multiple={multiple}
          selected={selected}
          selectedLabel={selectedLabel}
          pending={pending}
          query={items.query}
          onQueryChange={items.setQuery}
          loading={items.loading}
          error={items.error}
          onRetry={items.retry}
          options={options}
          emptyMessage={emptyMessage}
          presentation={presentation}
          statusField={statusField}
          labelError={items.labelError}
          actionError={actionError}
          page={items.page}
          total={items.total}
          onPageChange={items.setPage}
          onToggle={toggle}
          onApplySelected={
            onApply
              ? async () => {
                  const choices = selected.map((choiceId) => ({
                    id: choiceId,
                    label: selectedLabel(choiceId),
                    item: items.records.find(
                      (row) =>
                        String(row[collection.primaryKey.name]) === choiceId,
                    ) ?? { [collection.primaryKey.name]: choiceId },
                  }));
                  if (await onApply(choices)) {
                    setOpen(false);
                  } else {
                    items.retry();
                  }
                }
              : undefined
          }
          onCreate={
            onCreate
              ? () => {
                  setOpen(false);
                  onCreate();
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
