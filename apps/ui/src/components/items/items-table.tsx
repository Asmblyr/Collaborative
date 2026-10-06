"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { itemLabelField, recordLabel } from "./item-label";
import { ItemTableValue } from "./item-table-value";
import { useTableRelationLabels } from "./use-table-relation-labels";
import type { Collection, Item, ItemPage } from "./types";
import type { ItemColumn } from "./use-item-columns";
import { useUiCopy } from "@/lib/ui-copy";
import { defaultColumnWidth } from "./column-width";
import { ColumnResizeHandle } from "./column-resize-handle";

interface ItemsTableProps {
  collection: Collection;
  catalog: Collection[];
  items: Item[];
  recordLabels?: Record<string, string>;
  columns: ItemColumn[];
  widths: Record<string, number>;
  page: ItemPage;
  selected: Set<string>;
  disabled: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSelectPage: (checked: boolean) => void;
  onOpen: (item: Item) => void;
  onSort: (name: string) => void;
  onMove: (name: string, target: string, after?: boolean) => void;
  onResize: (name: string, width: number | undefined) => void;
}

export function ItemsTable({
  collection,
  catalog,
  items,
  recordLabels,
  columns,
  widths,
  page,
  selected,
  disabled,
  onSelect,
  onSelectPage,
  onOpen,
  onSort,
  onMove,
  onResize,
}: ItemsTableProps) {
  const copy = useUiCopy();

  const dragged = useRef<string | null>(null);
  const [drop, setDrop] = useState<{ name: string; after: boolean } | null>(
    null,
  );
  const itemKey = (item: Item) => String(item[collection.primaryKey.name]);
  const selectedOnPage = items.filter((item) =>
    selected.has(itemKey(item)),
  ).length;
  const labelField = itemLabelField(collection);
  const labels = useTableRelationLabels(catalog, items, columns);
  const columnWidth = (column: ItemColumn) =>
    (Object.hasOwn(widths, column.name) ? widths[column.name] : undefined) ??
    defaultColumnWidth(column, labelField, collection.primaryKey.name);

  function over(event: DragEvent<HTMLTableCellElement>, name: string) {
    if (!dragged.current || dragged.current === name) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDrop({ name, after: event.clientX >= rect.left + rect.width / 2 });
  }

  function keyboardMove(event: KeyboardEvent<HTMLButtonElement>, name: string) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const index = columns.findIndex((column) => column.name === name);
    const other = columns[index + (event.key === "ArrowLeft" ? -1 : 1)];
    if (!other) return;
    event.preventDefault();
    onMove(name, other.name, event.key === "ArrowRight");
  }

  return (
    <div className="min-h-0 flex-1 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto">
      <Table
        aria-label={copy("Записи коллекции {{value0}}", {
          value0: collection.name,
        })}
        className="table-fixed"
        style={{
          minWidth:
            48 +
            columns.reduce((width, column) => width + columnWidth(column), 0),
        }}
      >
        <colgroup>
          <col style={{ width: 48 }} />
          {columns.map((column) => (
            <col
              key={column.name}
              data-column-size={column.name}
              style={{ width: columnWidth(column) }}
            />
          ))}
          <col />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              scope="col"
              className="sticky top-0 left-0 z-30 bg-card px-4"
            >
              <Checkbox
                aria-label={copy("Выбрать все записи на странице")}
                checked={
                  selectedOnPage === items.length
                    ? true
                    : selectedOnPage > 0
                      ? "indeterminate"
                      : false
                }
                disabled={disabled}
                onCheckedChange={(checked) => onSelectPage(checked === true)}
              />
            </TableHead>
            {columns.map((column) => (
              <TableHead
                key={column.name}
                scope="col"
                draggable
                data-column={column.name}
                aria-sort={
                  (page.order ?? "field") === "field" &&
                  page.sort === column.name
                    ? page.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", column.name);
                  dragged.current = column.name;
                }}
                onDragEnd={() => {
                  dragged.current = null;
                  setDrop(null);
                }}
                onDragOver={(event) => over(event, column.name)}
                onDragLeave={() => setDrop(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged.current)
                    onMove(dragged.current, column.name, drop?.after);
                  dragged.current = null;
                  setDrop(null);
                }}
                className={`group sticky top-0 z-20 bg-card px-3 text-xs text-muted-foreground ${
                  drop?.name === column.name
                    ? drop.after
                      ? "border-r-2 border-r-primary"
                      : "border-l-2 border-l-primary"
                    : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    onKeyDown={(event) => keyboardMove(event, column.name)}
                    aria-label={copy(
                      "Переместить столбец {{value0}}. Используйте стрелки влево и вправо.",
                      { value0: column.label },
                    )}
                    className="shrink-0 cursor-grab rounded p-1 text-muted-foreground opacity-40 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
                  >
                    <GripVertical
                      className="size-3.5"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSort(column.name)}
                    className="flex min-w-0 items-center gap-1 rounded px-1 py-1 text-left hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={copy("Сортировать по {{value0}}", {
                      value0: column.label,
                    })}
                    title={column.name}
                  >
                    <span className="truncate">{column.label}</span>
                    {(page.order ?? "field") === "field" &&
                      page.sort === column.name &&
                      (page.direction === "asc" ? (
                        <ArrowUp
                          className="size-3"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowDown
                          className="size-3"
                          aria-hidden="true"
                        />
                      ))}
                  </button>
                </div>
                <ColumnResizeHandle
                  name={column.name}
                  label={column.label}
                  width={columnWidth(column)}
                  onResize={onResize}
                />
              </TableHead>
            ))}
            <TableHead
              aria-hidden="true"
              className="sticky top-0 bg-card p-0"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const id = itemKey(item);
            return (
              <TableRow
                key={id}
                tabIndex={disabled ? -1 : 0}
                data-state={selected.has(id) ? "selected" : undefined}
                aria-label={copy("Открыть запись {{value0}} ({{value1}})", {
                  value0: recordLabels?.[id] ?? recordLabel(collection, item),
                  value1: id,
                })}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  if (!disabled) onOpen(item);
                }}
                onKeyDown={(event) => {
                  if (disabled || event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(item);
                  }
                }}
              >
                <TableCell
                  className={`sticky left-0 z-10 px-4 ${selected.has(id) ? "bg-muted" : "bg-card"}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    aria-label={copy("Выбрать запись {{value0}} ({{value1}})", {
                      value0:
                        recordLabels?.[id] ?? recordLabel(collection, item),
                      value1: id,
                    })}
                    checked={selected.has(id)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onSelect(id, checked === true)
                    }
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.name}
                    data-column={column.name}
                    className="overflow-hidden px-4 py-3"
                  >
                    <ItemTableValue
                      column={column}
                      value={item[column.name]}
                      primary={column.name === collection.primaryKey.name}
                      emphasized={column.name === labelField}
                      relationLabel={
                        column.relation?.kind === "m2o"
                          ? labels.get(
                              JSON.stringify([
                                column.relation.collection,
                                String(item[column.name]),
                              ]),
                            )
                          : undefined
                      }
                    />
                  </TableCell>
                ))}
                <TableCell
                  aria-hidden="true"
                  className="p-0"
                />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
