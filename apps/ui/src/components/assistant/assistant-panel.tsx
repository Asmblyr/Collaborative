"use client";

import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "cn";
import { PopoverContent } from "@/components/ui/popover";
import { useUiCopy } from "@/lib/ui-copy";

const defaultSize = { width: 420, height: 660 };
interface Drag {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export function AssistantPanel({
  children,
  className,
  style,
  ...props
}: ComponentProps<typeof PopoverContent>) {
  const copy = useUiCopy();

  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState(defaultSize);
  const hintId = useId();

  function resize(
    width: number,
    height: number,
    bounds: { right: number; bottom: number },
  ) {
    const maxWidth = Math.min(bounds.right - 16, window.innerWidth - 32);
    const maxHeight = Math.min(bounds.bottom - 16, window.innerHeight - 96);
    setSize({
      width: Math.max(1, Math.min(maxWidth, Math.max(360, width))),
      height: Math.max(1, Math.min(maxHeight, Math.max(420, height))),
    });
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || !panel.current) return;
    const bounds = panel.current.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: bounds.width,
      height: bounds.height,
      right: bounds.right,
      bottom: bounds.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const from = drag.current;
    if (!from || event.pointerId !== from.pointerId) return;
    resize(
      from.width + from.x - event.clientX,
      from.height + from.y - event.clientY,
      from,
    );
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      setSize(defaultSize);
      return;
    }
    if (
      !panel.current ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const bounds = panel.current.getBoundingClientRect();
    const step = event.shiftKey ? 64 : 24;
    resize(
      bounds.width +
        (event.key === "ArrowLeft"
          ? step
          : event.key === "ArrowRight"
            ? -step
            : 0),
      bounds.height +
        (event.key === "ArrowUp"
          ? step
          : event.key === "ArrowDown"
            ? -step
            : 0),
      bounds,
    );
  }

  return (
    <PopoverContent
      {...props}
      ref={panel}
      side="top"
      align="end"
      sideOffset={12}
      style={{ ...style, width: size.width, height: size.height }}
      className={cn(
        "assistant-panel relative flex max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-6rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl p-0 shadow-2xl shadow-black/15 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2 motion-reduce:animate-none sm:max-w-[calc(100vw-2.5rem)] dark:shadow-black/50",
        className,
      )}
    >
      <button
        type="button"
        aria-label={copy("Изменить размер панели общения")}
        aria-describedby={hintId}
        className="absolute left-0.5 top-0.5 z-10 inline-flex size-6 touch-none cursor-nwse-resize select-none items-center justify-center border-0 bg-transparent p-0 text-muted-foreground/40 outline-none transition-colors hover:text-muted-foreground focus-visible:text-foreground focus-visible:[&_svg]:stroke-[2]"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={keyboard}
        onDoubleClick={() => setSize(defaultSize)}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 14a9 9 0 0 1 9-9" />
        </svg>
      </button>
      <span
        id={hintId}
        className="sr-only"
      >
        {copy(
          "Потяните угол или используйте стрелки. Двойной щелчок или Home вернёт исходный размер. ",
        )}
      </span>
      {children}
    </PopoverContent>
  );
}
