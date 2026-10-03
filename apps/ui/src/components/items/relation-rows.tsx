"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Ellipsis, Settings2, Unlink } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { availableColumns } from "./item-columns";
import { ItemTableValue } from "./item-table-value";
import { useTableRelationLabels } from "./use-table-relation-labels";
import type { RelationResult, RelationRow } from "./use-relation-panel";
import type { Collection } from "./types";
import { useDraftPreviews } from "./record-draft-context";

export function RelationRows({ result: source, target, catalog, pending, portalContainer, onOpen, onLink, onDetach, onSort }: {
  result: RelationResult; target: Collection; catalog: Collection[]; pending: boolean; portalContainer: HTMLElement | null;
  onOpen: (row: RelationRow) => void; onLink?: (row: RelationRow) => void;
  onDetach: (row: RelationRow) => void; onSort: (name: string) => void;
}) {
  const previews = useDraftPreviews();
  const draftRows = useMemo(() => source.data.map((row) => {
    const preview = previews.get(JSON.stringify([target.name, row.id]));
    return preview ? { ...row, values: { ...row.values, ...preview.item }, label: preview.label } : row;
  }), [source.data, previews, target.name]);
  const result = { ...source, data: draftRows };
  const available = availableColumns(target);
  const columns = result.display.columns.flatMap((name) => available.find((c) => c.name === name) ?? []);
  const items = useMemo(() => result.data.map((row) => row.values), [result.data]);
  const labels = useTableRelationLabels(catalog, items, columns);
  const rowLabel = (row: RelationRow) => row.label;
  const open = (row: RelationRow) => { if (!pending) onOpen({ ...row, label: rowLabel(row) }); };
  const hasActions = Boolean(onLink || result.abilities.detach);
  const actions = (row: RelationRow) => <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={pending}
      aria-label={`Действия со связью ${row.label}`} onClick={(e) => e.stopPropagation()}><Ellipsis /></Button></DropdownMenuTrigger>
    <DropdownMenuContent container={portalContainer} align="end" onClick={(e) => e.stopPropagation()}>
      {onLink && <DropdownMenuItem onSelect={() => onLink(row)}><Settings2 />Параметры связи</DropdownMenuItem>}
      {result.abilities.detach && <DropdownMenuItem onSelect={() => onDetach(row)}><Unlink />Отвязать запись</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
  if (result.display.layout === "list") return <ul className="divide-y border-t">{result.data.map((row) =>
    <li key={row.linkId} className="flex items-center gap-2 px-3 py-1.5">
      <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left font-normal"
        onClick={() => open(row)}><span className="truncate">{row.label}</span></Button>
      {hasActions && actions(row)}
    </li>)}</ul>;
  return <Table className={`border-t ${columns.length <= 4 ? "table-fixed" : ""} ${columns.length >= 3 ? "min-w-[36rem]" : ""}`}>
    <TableHeader><TableRow>
      {columns.map((column) => <TableHead key={column.name} className={column.name === target.primaryKey.name ?
        target.primaryKey.type === "serial" || target.primaryKey.type === "bigserial" ? "w-16" : "w-36" :
        column.presentation?.display?.kind === "status" ? "w-36" : undefined}
        aria-sort={result.page.sort === column.name ? result.page.direction === "asc" ? "ascending" : "descending" : "none"}>
        <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8 text-xs" onClick={() => onSort(column.name)}>
          {column.label}{result.page.sort === column.name && (result.page.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </Button>
      </TableHead>)}
      {hasActions && <TableHead className="sticky right-0 w-10 bg-card"><span className="sr-only">Действия</span></TableHead>}
    </TableRow></TableHeader>
    <TableBody>{result.data.map((row) => <TableRow key={row.linkId} className="cursor-pointer focus-visible:outline focus-visible:outline-ring"
      tabIndex={0} aria-label={`Открыть запись ${rowLabel(row)}`} onClick={() => open(row)} onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(row); }
      }}>
      {columns.map((column, index) => <TableCell key={column.name} className="max-w-72">
        <ItemTableValue column={column} value={row.values[column.name]} primary={column.name === target.primaryKey.name} emphasized={index === 0}
          relationLabel={column.relation ? labels.get(JSON.stringify([column.relation.collection, String(row.values[column.name])])) : undefined} />
      </TableCell>)}
      {hasActions && <TableCell className="sticky right-0 bg-card text-right">{actions(row)}</TableCell>}
    </TableRow>)}</TableBody>
  </Table>;
}
