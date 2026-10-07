"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ItemFilterMenu } from "./item-filter-menu";
import {
  hasMultipleValues,
  type FilterCondition,
  type FilterScope,
} from "./item-filter-options";
import { useFilterRelationItems } from "./use-filter-relation-items";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFilterRelationValue({
  condition,
  scope,
  autoFocus,
  onChange,
}: {
  condition: FilterCondition;
  scope: FilterScope;
  autoFocus: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const copy = useUiCopy();

  const [open, setOpen] = useState(autoFocus);
  const multiple = hasMultipleValues(condition.op);
  const selected = Array.isArray(condition.value)
    ? condition.value
    : condition.value
      ? [condition.value]
      : [];
  const items = useFilterRelationItems(scope, selected, open);
  const summary = selected.map((id) => items.labels.get(id) ?? id);
  const toggle = (id: string) => {
    if (!multiple) {
      onChange(id);
      setOpen(false);
      return;
    }
    if (selected.includes(id))
      onChange(selected.filter((value) => value !== id));
    else if (selected.length < 20) onChange([...selected, id]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={copy("Выбранные записи связи ") + scope.id}
          className="h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 font-normal"
        >
          <Link2
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span
            className={
              "truncate " + (!selected.length ? "text-muted-foreground" : "")
            }
          >
            {summary[0] ??
              (multiple ? copy("выбрать записи…") : copy("выбрать запись…"))}
          </span>
          {selected.length > 1 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              +{selected.length - 1}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={5}
        className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">
            {scope.collection === "@users"
              ? copy("Пользователи")
              : scope.collection}
          </p>
          <p className="text-xs text-muted-foreground">
            {multiple
              ? copy("Выбрано {{value0}} из 20", { value0: selected.length })
              : copy("Выберите одну запись")}
          </p>
        </div>
        {multiple && selected.length > 0 && (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto border-b p-2">
            {selected.map((id) => (
              <span
                key={id}
                className="flex max-w-full items-center rounded-md bg-muted pl-2 text-xs"
              >
                <span className="truncate">{items.labels.get(id) ?? id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 shrink-0"
                  aria-label={
                    copy("Убрать запись ") + (items.labels.get(id) ?? id)
                  }
                  onClick={() => toggle(id)}
                >
                  <X
                    aria-hidden="true"
                    className="size-3"
                  />
                </Button>
              </span>
            ))}
          </div>
        )}
        <ItemFilterMenu
          query={items.query}
          onQueryChange={items.setQuery}
          maxLength={100}
          placeholder={
            copy("Найти запись в ") +
            (scope.collection === "@users"
              ? copy("Пользователи")
              : scope.collection)
          }
        >
          {items.loading ? (
            <p
              role="status"
              className="p-3 text-xs text-muted-foreground"
            >
              {copy("Загрузка записей… ")}
            </p>
          ) : items.error ? (
            <div
              role="alert"
              className="p-3 text-xs text-destructive"
            >
              {items.error}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={items.retry}
              >
                {copy("Повторить ")}
              </Button>
            </div>
          ) : items.options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {items.query
                ? copy("Ничего не найдено")
                : copy("В коллекции нет записей")}
            </p>
          ) : (
            items.options.map(({ id, label }) => {
              const checked = selected.includes(id);
              const disabled = multiple && !checked && selected.length >= 20;
              const content = (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{label}</span>
                  {label !== id && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {id}
                    </span>
                  )}
                </span>
              );
              return multiple ? (
                <label
                  key={id}
                  className={
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted " +
                    (disabled ? "cursor-not-allowed opacity-50" : "")
                  }
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    aria-label={copy("Выбрать ") + label}
                    onCheckedChange={() => toggle(id)}
                  />
                  {content}
                </label>
              ) : (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2 px-2 py-2 text-left font-normal"
                  onClick={() => toggle(id)}
                >
                  {content}
                  {checked && (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  )}
                </Button>
              );
            })
          )}
        </ItemFilterMenu>
        {items.labelError && (
          <p
            role="status"
            className="px-3 pb-2 text-xs text-muted-foreground"
          >
            {items.labelError}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy("Предыдущие записи")}
              disabled={items.loading || items.page === 1}
              onClick={() => items.setPage(items.page - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {items.page} / {Math.max(1, Math.ceil(items.total / 25))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy("Следующие записи")}
              disabled={items.loading || items.page * 25 >= items.total}
              onClick={() => items.setPage(items.page + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!selected.length}
              onClick={() => onChange(multiple ? [] : "")}
            >
              {copy("Очистить ")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {copy("Готово ")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
