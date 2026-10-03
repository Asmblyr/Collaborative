"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ItemFilterMenu } from "./item-filter-menu";
import { itemLabelField } from "./item-label";
import { useRelationItems } from "./use-relation-items";
import {
  recordChoiceColumns,
  recordChoicePresentation,
} from "./record-choice-presentation";
import { useTableRelationLabels } from "./use-table-relation-labels";
import { availableColumns } from "./item-columns";
import { PresentedValue } from "./presented-value";
import type { Collection, Item } from "./types";
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
  description,
  emptyMessage,
  excludedIds = [],
  onChoose,
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
  pending?: boolean;
  id?: string;
  actionError?: string;
  labelField?: string;
  catalog: Collection[];
  title?: string;
  previewColumns?: string[];
  candidatesEndpoint?: string;
  description?: string;
  emptyMessage?: string;
  excludedIds?: string[];
}) {
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
  );
  const columns = recordChoiceColumns(collection, catalog, previewColumns);
  const relationLabels = useTableRelationLabels(
    catalog,
    items.records,
    columns,
  );
  const presentation = new Map(
    items.records.map((item) => {
      const id = String(item[collection.primaryKey.name]);
      const view = recordChoicePresentation(
        collection,
        item,
        columns,
        relationLabels,
        labelField,
      );
      const label = items.labels.get(id);
      return [
        id,
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
  const status = availableColumns(collection).find(
    (column) => column.presentation?.display?.kind === "status",
  );
  const options = items.options.filter(
    (option) => !excludedIds.includes(option.id),
  );
  function toggle(value: string) {
    if (!multiple) {
      if (onChoose)
        onChoose({
          id: value,
          label: selectedLabel(value),
          item:
            items.records.find(
              (row) => String(row[collection.primaryKey.name]) === value,
            ) ?? {},
        });
      else onChange([value]);
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
        if (!pending) setOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          aria-label={`Выбрать записи: ${collection.name}`}
          className={
            trigger
              ? "gap-2"
              : "h-10 w-full min-w-0 justify-between font-normal"
          }
        >
          {trigger ?? (
            <>
              <span className="truncate">
                {selected.length
                  ? selectedLabel(selected[0])
                  : "Выберите запись…"}
              </span>
              <ChevronsUpDown
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        align="start"
        sideOffset={6}
        aria-label={
          title ? `Выбор: ${title}` : `Выбор записей ${collection.name}`
        }
        className="w-[min(32rem,calc(100vw-3rem))] overflow-hidden p-0"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) setOpen(false);
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {title || collection.displayName || collection.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {multiple ? `Выбрано: ${selected.length} / 100` : "Одна запись"}
          </span>
        </div>
        {description && (
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {multiple && selected.length > 0 && (
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto border-b p-2">
            {selected.map((value) => (
              <span
                key={value}
                className="flex max-w-full items-center rounded-md bg-muted pl-2 text-xs"
              >
                <span className="truncate">{selectedLabel(value)}</span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-6"
                  disabled={pending}
                  aria-label={`Снять выбор ${selectedLabel(value)}`}
                  onClick={() => toggle(value)}
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
        <ItemFilterMenu
          query={items.query}
          onQueryChange={items.setQuery}
          maxLength={100}
          placeholder="Поиск записей…"
        >
          {items.loading ? (
            <p
              role="status"
              className="p-3 text-sm text-muted-foreground"
            >
              Загрузка…
            </p>
          ) : items.error ? (
            <div
              role="alert"
              className="p-3 text-sm text-destructive"
            >
              {items.error}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={items.retry}
              >
                Повторить
              </Button>
            </div>
          ) : !options.length ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {items.query.trim()
                ? "По этому запросу доступных записей не найдено"
                : (emptyMessage ?? "Ничего не найдено")}
            </p>
          ) : (
            options.map(({ id: value, label: originalLabel, item }) => {
              const checked = selected.includes(value);
              const view = presentation.get(value);
              const label = view?.label ?? originalLabel;
              const content = (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {view?.detail ?? `ID: ${value}`}
                  </span>
                </span>
              );
              const badge =
                status?.presentation?.display && item[status.name] != null ? (
                  <span className="shrink-0">
                    <PresentedValue
                      value={item[status.name]}
                      display={status.presentation.display}
                    />
                  </span>
                ) : null;
              return multiple ? (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted has-[[data-state=checked]]:bg-muted/70"
                >
                  <Checkbox
                    checked={checked}
                    disabled={pending || (!checked && selected.length >= 100)}
                    aria-label={`Выбрать ${view?.selectedLabel ?? label} (ID: ${value})`}
                    onCheckedChange={() => toggle(value)}
                  />
                  {content}
                  {badge}
                </label>
              ) : (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="h-auto w-full justify-start gap-3 px-2 py-2 text-left font-normal"
                  onClick={() => toggle(value)}
                >
                  {content}
                  {badge}
                  {checked && <Check className="size-4 shrink-0" />}
                </Button>
              );
            })
          )}
        </ItemFilterMenu>
        {items.labelError && (
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            {items.labelError}
          </p>
        )}
        {actionError && (
          <p
            role="alert"
            className="px-3 pb-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Предыдущие записи"
              disabled={items.loading || items.page === 1 || pending}
              onClick={() => items.setPage(items.page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {items.page} / {Math.max(1, Math.ceil(items.total / 25))}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Следующие записи"
              disabled={
                items.loading || items.page * 25 >= items.total || pending
              }
              onClick={() => items.setPage(items.page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          {onApply ? (
            <Button
              type="button"
              size="sm"
              disabled={!selected.length || pending}
              onClick={async () => {
                const choices = selected.map((id) => ({
                  id,
                  label: selectedLabel(id),
                  item: items.records.find(
                    (row) => String(row[collection.primaryKey.name]) === id,
                  ) ?? { [collection.primaryKey.name]: id },
                }));
                if (await onApply(choices)) setOpen(false);
                else items.retry();
              }}
            >
              {pending ? "Добавление…" : "Добавить выбранные"}
            </Button>
          ) : (
            onCreate && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
              >
                <Plus className="size-4" />
                Создать запись
              </Button>
            )
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
