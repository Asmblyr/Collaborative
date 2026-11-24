"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUiCopy } from "@/lib/ui-copy";

function AssistantMarkdownTable({ children }: { children?: ReactNode }) {
  const copy = useUiCopy();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    left: false,
    right: false,
  });

  const syncScroll = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) {
      return;
    }

    const left = element.scrollLeft > 2;
    const right =
      element.scrollWidth - element.clientWidth - element.scrollLeft > 2;
    setScrollState((previous) =>
      previous.left === left && previous.right === right
        ? previous
        : { left, right },
    );
  }, []);

  useEffect(() => {
    syncScroll();
    const element = scrollerRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(syncScroll);
    observer.observe(element);
    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }
    return () => observer.disconnect();
  }, [syncScroll, children]);

  return (
    <div className="max-w-full overflow-hidden rounded-lg border bg-background/50 shadow-xs">
      <div className="relative max-w-full">
        <Table
          containerProps={{
            ref: scrollerRef,
            role: "region",
            "aria-label": copy("Таблица"),
            tabIndex: 0,
            onScroll: syncScroll,
            className:
              "max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          }}
          className="w-full min-w-full text-xs leading-5 [overflow-wrap:anywhere]"
        >
          {children}
        </Table>
        {scrollState.left && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background/95 to-transparent"
          />
        )}
        {scrollState.right && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/95 to-transparent"
          />
        )}
      </div>
      {scrollState.right && (
        <div className="border-t bg-muted/35 px-2.5 py-1 text-right text-[10px] leading-4 text-muted-foreground">
          {copy.locale.startsWith("en")
            ? "Scroll table right →"
            : "Прокрутите таблицу вправо →"}
        </div>
      )}
    </div>
  );
}

export function AssistantMessageContent({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`min-w-0 [overflow-wrap:anywhere] ${compact ? "space-y-2 text-xs leading-5 text-muted-foreground" : "space-y-3 text-sm leading-6"}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          table: ({ children }) => (
            <AssistantMarkdownTable>{children}</AssistantMarkdownTable>
          ),
          thead: ({ children }) => (
            <TableHeader className="bg-muted/60">{children}</TableHeader>
          ),
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => (
            <TableRow className="hover:bg-transparent">{children}</TableRow>
          ),
          th: ({ children, style }) => (
            <TableHead
              style={style}
              className="h-auto min-w-[4.5rem] max-w-44 whitespace-normal break-words px-2 py-1.5 text-[11px] font-medium"
            >
              {children}
            </TableHead>
          ),
          td: ({ children, style }) => (
            <TableCell
              style={style}
              className="min-w-[4.5rem] max-w-48 whitespace-normal break-words px-2 py-1.5 align-top"
            >
              {children}
            </TableCell>
          ),
          blockquote: ({ children }) => (
            <blockquote className="space-y-2 border-l-2 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto whitespace-pre rounded-lg bg-background/70 p-3 text-xs [overflow-wrap:normal]">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-background/60 px-1 py-0.5 text-[0.9em]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          // Model-generated URLs must not fetch remote images automatically.
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
