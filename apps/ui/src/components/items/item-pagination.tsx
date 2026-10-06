"use client";

import type { MouseEvent } from "react";
import { itemsPageHref } from "@/lib/item-location";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import type { ItemPage } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

function visiblePages(current: bigint, total: bigint): (bigint | null)[] {
  if (total <= BigInt(7))
    return Array.from({ length: Number(total) }, (_, index) =>
      BigInt(index + 1),
    );
  const candidates = [
    BigInt(1),
    BigInt(2),
    current - BigInt(1),
    current,
    current + BigInt(1),
    total - BigInt(1),
    total,
  ].filter((number) => number >= BigInt(1) && number <= total);
  const pages = [...new Set(candidates)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const result: (bigint | null)[] = [];
  for (const number of pages) {
    const previous = result[result.length - 1];
    if (previous !== undefined && previous !== null) {
      if (number - previous === BigInt(2)) result.push(previous + BigInt(1));
      else if (number - previous > BigInt(2)) result.push(null);
    }
    result.push(number);
  }
  return result;
}

export function ItemPagination({
  page,
  pathname,
  q,
  filter,
  onPage,
  onSize,
}: {
  page: ItemPage;
  pathname: string;
  q: string;
  filter: string;
  onPage: (number: number) => void;
  onSize: (size: number) => void;
}) {
  const copy = useUiCopy();

  const total = BigInt(page.total);
  const size = BigInt(page.size);
  const pages =
    total === BigInt(0) ? BigInt(1) : (total + size - BigInt(1)) / size;
  const current = BigInt(page.number);
  const start =
    total === BigInt(0) ? BigInt(0) : (current - BigInt(1)) * size + BigInt(1);
  const end = total < current * size ? total : current * size;

  function href(number: bigint): string {
    return itemsPageHref(pathname, { ...page, number }, q, filter);
  }

  function visit(event: MouseEvent<HTMLAnchorElement>, number: bigint) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      number > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return;
    event.preventDefault();
    if (number !== current) onPage(Number(number));
  }

  const previousDisabled = current <= BigInt(1);
  const nextDisabled = current >= pages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-muted-foreground">
          {start.toString()}–{end.toString()} {copy(" из ")}
          {page.total}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{copy("На странице")}</span>
          <Select
            value={String(page.size)}
            onValueChange={(value) => onSize(Number(value))}
          >
            <SelectTrigger
              size="sm"
              aria-label={copy("Записей на странице")}
              className="w-20"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((value) => (
                <SelectItem
                  key={value}
                  value={String(value)}
                >
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Pagination className="mx-0 w-auto max-w-full justify-start overflow-x-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={href(previousDisabled ? current : current - BigInt(1))}
              aria-disabled={previousDisabled}
              tabIndex={previousDisabled ? -1 : undefined}
              className={
                previousDisabled ? "pointer-events-none opacity-50" : undefined
              }
              onClick={(event) => visit(event, current - BigInt(1))}
            />
          </PaginationItem>
          {visiblePages(current, pages).map((number, index) => (
            <PaginationItem key={number?.toString() ?? `ellipsis-${index}`}>
              {number === null ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href={href(number)}
                  isActive={number === current}
                  aria-label={copy("Страница {{value0}}", { value0: number })}
                  onClick={(event) => visit(event, number)}
                >
                  {number.toString()}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href={href(nextDisabled ? current : current + BigInt(1))}
              aria-disabled={nextDisabled}
              tabIndex={nextDisabled ? -1 : undefined}
              className={
                nextDisabled ? "pointer-events-none opacity-50" : undefined
              }
              onClick={(event) => visit(event, current + BigInt(1))}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
