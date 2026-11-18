"use client";

import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import type { ItemColumn } from "./item-columns";
import { ItemFilterMenu } from "./item-filter-menu";
import { PresentedValue } from "./presented-value";
import type { RecordChoiceView } from "./record-choice-presentation";
import type { Item } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export interface RecordChooserOption {
  id: string;
  label: string;
  item: Item;
}

export function RecordChooserContent({
  heading,
  description,
  multiple,
  selected,
  selectedLabel,
  pending,
  query,
  onQueryChange,
  loading,
  error,
  onRetry,
  options,
  emptyMessage,
  presentation,
  statusField,
  labelError,
  actionError,
  page,
  total,
  onPageChange,
  onToggle,
  onApplySelected,
  onCreate,
}: {
  heading: string;
  description?: string;
  multiple: boolean;
  selected: string[];
  selectedLabel: (value: string) => string;
  pending: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
  options: RecordChooserOption[];
  emptyMessage?: string;
  presentation: Map<string, RecordChoiceView>;
  statusField?: ItemColumn;
  labelError?: string;
  actionError?: string;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  onToggle: (value: string) => void;
  onApplySelected?: () => Promise<void>;
  onCreate?: () => void;
}) {
  const copy = useUiCopy();

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="min-w-0 truncate text-sm font-medium">{heading}</span>
        <span className="text-xs text-muted-foreground">
          {multiple
            ? copy("Выбрано: {{value0}} / 100", { value0: selected.length })
            : copy("Одна запись")}
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
                aria-label={copy("Снять выбор {{value0}}", {
                  value0: selectedLabel(value),
                })}
                onClick={() => onToggle(value)}
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      )}
      <ItemFilterMenu
        query={query}
        onQueryChange={onQueryChange}
        maxLength={100}
        placeholder={copy("Поиск записей…")}
      >
        {loading ? (
          <p
            role="status"
            className="p-3 text-sm text-muted-foreground"
          >
            {copy("Загрузка…")}
          </p>
        ) : error ? (
          <div
            role="alert"
            className="p-3 text-sm text-destructive"
          >
            {error}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRetry}
            >
              {copy("Повторить")}
            </Button>
          </div>
        ) : !options.length ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {query.trim()
              ? copy("По этому запросу доступных записей не найдено")
              : (emptyMessage ?? copy("Ничего не найдено"))}
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
              statusField?.presentation?.display &&
              item[statusField.name] != null ? (
                <span className="shrink-0">
                  <PresentedValue
                    value={item[statusField.name]}
                    display={statusField.presentation.display}
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
                  aria-label={copy("Выбрать {{value0}} (ID: {{value1}})", {
                    value0: view?.selectedLabel ?? label,
                    value1: value,
                  })}
                  onCheckedChange={() => onToggle(value)}
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
                onClick={() => onToggle(value)}
              >
                {content}
                {badge}
                {checked && <Check className="size-4 shrink-0" />}
              </Button>
            );
          })
        )}
      </ItemFilterMenu>
      {labelError && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{labelError}</p>
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
            aria-label={copy("Предыдущие записи")}
            disabled={loading || page === 1 || pending}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page} / {Math.max(1, Math.ceil(total / 25))}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={copy("Следующие записи")}
            disabled={loading || page * 25 >= total || pending}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        {onApplySelected ? (
          <Button
            type="button"
            size="sm"
            disabled={!selected.length || pending}
            onClick={onApplySelected}
          >
            {pending ? copy("Добавление…") : copy("Добавить выбранные")}
          </Button>
        ) : (
          onCreate && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCreate}
            >
              <Plus className="size-4" />
              {copy("Создать запись")}
            </Button>
          )
        )}
      </div>
    </>
  );
}
