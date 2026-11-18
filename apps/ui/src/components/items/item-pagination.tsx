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
import { useWorkspace } from "@/components/workspaces/workspace-provider";

import { cn } from "@/lib/utils";

export function visiblePages(
  current: bigint,
  total: bigint,
): (bigint | null)[] {
  if (total <= BigInt(7)) {
    return Array.from({ length: Number(total) }, (_, index) =>
      BigInt(index + 1),
    );
  }

  let clamped = current;
  if (clamped < BigInt(1)) {
    clamped = BigInt(1);
  } else if (clamped > total) {
    clamped = total;
  }

  if (clamped <= BigInt(4)) {
    return [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5), null, total];
  }

  if (clamped >= total - BigInt(3)) {
    return [
      BigInt(1),
      null,
      total - BigInt(4),
      total - BigInt(3),
      total - BigInt(2),
      total - BigInt(1),
      total,
    ];
  }

  return [
    BigInt(1),
    null,
    clamped - BigInt(1),
    clamped,
    clamped + BigInt(1),
    null,
    total,
  ];
}

export function ItemPagination({
  page,
  pathname,
  q,
  filter,
  pending = false,
  buildHref,
  onPage,
  onSize,
}: {
  page: ItemPage;
  pathname: string;
  q: string;
  filter: string;
  pending?: boolean;
  buildHref?: (number: bigint) => string;
  onPage: (number: number) => void;
  onSize: (size: number) => void;
}) {
  const copy = useUiCopy();
  const workspace = useWorkspace();

  const total = BigInt(page.total);
  const size = BigInt(page.size);
  const pages =
    total === BigInt(0) ? BigInt(1) : (total + size - BigInt(1)) / size;
  const current = BigInt(page.number);
  const start =
    total === BigInt(0) ? BigInt(0) : (current - BigInt(1)) * size + BigInt(1);
  const end = total < current * size ? total : current * size;

  function href(number: bigint): string {
    const target = buildHref
      ? buildHref(number)
      : itemsPageHref(pathname, { ...page, number }, q, filter);
    return workspace?.href(target) ?? target;
  }

  function visit(event: MouseEvent<HTMLAnchorElement>, number: bigint) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      number > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return;
    }
    event.preventDefault();
    if (!pending && number !== current) {
      onPage(Number(number));
    }
  }

  const previousDisabled = current <= BigInt(1);
  const nextDisabled = current >= pages;

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm transition-opacity duration-150",
        pending && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="tabular-nums text-muted-foreground">
          {start.toString()}–{end.toString()} {copy("из")} {page.total}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{copy("На странице")}</span>
          <Select
            value={String(page.size)}
            disabled={pending}
            onValueChange={(value) => onSize(Number(value))}
          >
            <SelectTrigger
              size="sm"
              aria-label={copy("Записей на странице")}
              className="w-20 tabular-nums"
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
              aria-disabled={previousDisabled || pending}
              tabIndex={previousDisabled || pending ? -1 : undefined}
              className={
                previousDisabled || pending
                  ? "pointer-events-none opacity-50"
                  : undefined
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
                  aria-disabled={pending || undefined}
                  aria-label={copy("Страница {{value0}}", { value0: number })}
                  className={pending ? "pointer-events-none" : undefined}
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
              aria-disabled={nextDisabled || pending}
              tabIndex={nextDisabled || pending ? -1 : undefined}
              className={
                nextDisabled || pending
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
              onClick={(event) => visit(event, current + BigInt(1))}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
