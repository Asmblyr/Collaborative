"use client";

import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  const copy = useUiCopy();

  return (
    <nav
      role="navigation"
      aria-label={copy("Пагинация")}
      data-slot="pagination"
      className={cn("flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row flex-wrap items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="pagination-item"
      className={cn("flex items-center shrink-0", className)}
      {...props}
    />
  );
}

type PaginationLinkProps = React.ComponentProps<"a"> & {
  isActive?: boolean;
  size?: "default" | "sm" | "icon" | "icon-sm";
};

function PaginationLink({
  className,
  isActive,
  size = "icon",
  draggable = false,
  ...props
}: PaginationLinkProps) {
  let pageNumberSizing: string | undefined;
  if (size === "icon") {
    pageNumberSizing = "size-auto h-8 min-w-8 px-2.5 tabular-nums";
  } else if (size === "icon-sm") {
    pageNumberSizing = "size-auto h-7 min-w-7 px-2 tabular-nums";
  }

  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      draggable={draggable}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        "active:not-aria-[haspopup]:translate-y-0",
        pageNumberSizing,
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: PaginationLinkProps) {
  const copy = useUiCopy();

  return (
    <PaginationLink
      aria-label={copy("Предыдущая страница")}
      size="default"
      className={cn("gap-1 px-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span className="hidden sm:inline">{copy("Назад")}</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: PaginationLinkProps) {
  const copy = useUiCopy();

  return (
    <PaginationLink
      aria-label={copy("Следующая страница")}
      size="default"
      className={cn("gap-1 px-2.5", className)}
      {...props}
    >
      <span className="hidden sm:inline">{copy("Далее")}</span>
      <ChevronRightIcon aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const copy = useUiCopy();

  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn("flex size-8 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">{copy("Другие страницы")}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
