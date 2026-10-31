"use client";

import * as React from "react";
import { cn } from "cn";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { ArrowDownIcon } from "lucide-react";
import { useUiCopy } from "@/lib/ui-copy";

export interface MessageScrollerScrollOptions {
  behavior?: ScrollBehavior;
}

export interface MessageScrollerContextValue {
  isScrollable: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  scrollToEnd: (options?: MessageScrollerScrollOptions) => void;
  scrollToStart: (options?: MessageScrollerScrollOptions) => void;
  setViewport: (element: HTMLDivElement | null) => void;
  setContent: (element: HTMLDivElement | null) => void;
}

const MessageScrollerContext =
  React.createContext<MessageScrollerContextValue | null>(null);

const SCROLL_EDGE_THRESHOLD = 48;

export function computeScrollerMetrics(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold = SCROLL_EDGE_THRESHOLD,
): {
  isScrollable: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
} {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const isScrollable = maxScroll > 1;
  const isAtStart = !isScrollable || scrollTop <= threshold;
  const isAtEnd = !isScrollable || maxScroll - scrollTop <= threshold;

  return { isScrollable, isAtStart, isAtEnd };
}

function MessageScrollerProvider({
  autoScroll = false,
  children,
}: {
  autoScroll?: boolean;
  children?: React.ReactNode;
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [mountGeneration, setMountGeneration] = React.useState(0);
  const [metrics, setMetrics] = React.useState({
    isScrollable: false,
    isAtStart: true,
    isAtEnd: true,
  });

  const followingRef = React.useRef(autoScroll);
  const programmaticScrollRef = React.useRef(false);

  const setViewport = React.useCallback((element: HTMLDivElement | null) => {
    if (viewportRef.current !== element) {
      viewportRef.current = element;
      setMountGeneration((generation) => generation + 1);
    }
  }, []);

  const setContent = React.useCallback((element: HTMLDivElement | null) => {
    if (contentRef.current !== element) {
      contentRef.current = element;
      setMountGeneration((generation) => generation + 1);
    }
  }, []);

  const syncMetrics = React.useCallback((element: HTMLDivElement) => {
    const next = computeScrollerMetrics(
      element.scrollTop,
      element.scrollHeight,
      element.clientHeight,
    );
    setMetrics((previous) => {
      if (
        previous.isScrollable === next.isScrollable &&
        previous.isAtStart === next.isAtStart &&
        previous.isAtEnd === next.isAtEnd
      ) {
        return previous;
      }
      return next;
    });
    return next;
  }, []);

  const scrollToEnd = React.useCallback(
    (options?: MessageScrollerScrollOptions) => {
      followingRef.current = true;
      const element = viewportRef.current;
      if (!element) {
        return;
      }
      programmaticScrollRef.current = true;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: options?.behavior ?? "smooth",
      });
      syncMetrics(element);
      window.requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    },
    [syncMetrics],
  );

  const scrollToStart = React.useCallback(
    (options?: MessageScrollerScrollOptions) => {
      followingRef.current = false;
      const element = viewportRef.current;
      if (!element) {
        return;
      }
      programmaticScrollRef.current = true;
      element.scrollTo({
        top: 0,
        behavior: options?.behavior ?? "smooth",
      });
      syncMetrics(element);
      window.requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    },
    [syncMetrics],
  );

  React.useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    if (autoScroll && followingRef.current) {
      element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
    }
    const frame = window.requestAnimationFrame(() => {
      syncMetrics(element);
    });

    const handleScroll = () => {
      const next = syncMetrics(element);
      if (!programmaticScrollRef.current) {
        followingRef.current = next.isAtEnd;
      }
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener("scroll", handleScroll);
    };
  }, [autoScroll, mountGeneration, syncMetrics]);

  React.useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (autoScroll && followingRef.current) {
        programmaticScrollRef.current = true;
        element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
        window.requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
      syncMetrics(element);
    });

    observer.observe(element);
    const contentElement = contentRef.current;
    if (contentElement) {
      observer.observe(contentElement);
    }

    return () => {
      observer.disconnect();
    };
  }, [autoScroll, mountGeneration, syncMetrics]);

  const contextValue = React.useMemo<MessageScrollerContextValue>(
    () => ({
      isScrollable: metrics.isScrollable,
      isAtStart: metrics.isAtStart,
      isAtEnd: metrics.isAtEnd,
      scrollToEnd,
      scrollToStart,
      setViewport,
      setContent,
    }),
    [metrics, scrollToEnd, scrollToStart, setContent, setViewport],
  );

  return (
    <MessageScrollerContext.Provider value={contextValue}>
      {children}
    </MessageScrollerContext.Provider>
  );
}

function useMessageScroller(): MessageScrollerContextValue {
  const context = React.useContext(MessageScrollerContext);
  if (!context) {
    throw new Error("MessageScrollerProvider is required");
  }
  return context;
}

function useMessageScrollerScrollable(): boolean {
  return useMessageScroller().isScrollable;
}

function useMessageScrollerVisibility(
  direction: "start" | "end" = "end",
): boolean {
  const { isScrollable, isAtStart, isAtEnd } = useMessageScroller();
  if (!isScrollable) {
    return false;
  }
  return direction === "end" ? !isAtEnd : !isAtStart;
}

function MessageScroller({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-scroller"
      className={cn(
        "group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { setViewport } = useMessageScroller();

  return (
    <div
      ref={setViewport}
      data-slot="message-scroller-viewport"
      className={cn(
        "size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { setContent } = useMessageScroller();

  return (
    <div
      ref={setContent}
      data-slot="message-scroller-content"
      className={cn("flex h-max min-h-full flex-col gap-6", className)}
      {...props}
    />
  );
}

function MessageScrollerItem({
  className,
  messageId,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<"div"> & {
  messageId?: string;
  scrollAnchor?: boolean;
}) {
  return (
    <div
      data-slot="message-scroller-item"
      data-message-id={messageId}
      data-scroll-anchor={scrollAnchor || undefined}
      className={cn(
        "min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerButton({
  direction = "end",
  className,
  children,
  variant = "secondary",
  size = "icon-sm",
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & {
  direction?: "start" | "end";
}) {
  const copy = useUiCopy();
  const { scrollToEnd, scrollToStart } = useMessageScroller();
  const active = useMessageScrollerVisibility(direction);

  return (
    <Button
      type="button"
      data-slot="message-scroller-button"
      data-direction={direction}
      data-active={active ? "true" : "false"}
      variant={variant}
      size={size}
      tabIndex={active ? 0 : -1}
      aria-hidden={!active || undefined}
      className={cn(
        "absolute inset-s-1/2 -translate-x-1/2 border-border bg-background text-foreground transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] data-[direction=end]:bottom-4 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full rtl:translate-x-1/2 data-[direction=start]:[&_svg]:rotate-180",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        if (direction === "end") {
          scrollToEnd({ behavior: "smooth" });
        } else {
          scrollToStart({ behavior: "smooth" });
        }
      }}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDownIcon />
          <span className="sr-only">
            {direction === "end"
              ? copy("К последнему сообщению")
              : copy("К началу переписки")}
          </span>
        </>
      )}
    </Button>
  );
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
};
