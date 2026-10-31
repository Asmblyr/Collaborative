"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
}

type ToastListener = (entries: readonly ToastEntry[]) => void;

let currentEntries: ToastEntry[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<string, number>();

function emit() {
  const snapshot = [...currentEntries];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }

  const next = currentEntries.filter((entry) => entry.id !== id);
  if (next.length !== currentEntries.length) {
    currentEntries = next;
    emit();
  }
}

function scheduleDismiss(id: string, durationMs: number): void {
  const previousTimer = timers.get(id);
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
    timers.delete(id);
  }

  if (durationMs > 0 && typeof window !== "undefined") {
    const timer = window.setTimeout(() => {
      dismissToast(id);
    }, durationMs);
    timers.set(id, timer);
  }
}

export function showToast(
  message: string,
  variant: ToastVariant = "success",
  durationMs = 4000,
): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  const existing = currentEntries.find(
    (entry) => entry.message === trimmed && entry.variant === variant,
  );
  if (existing) {
    scheduleDismiss(existing.id, durationMs);
    return existing.id;
  }

  const id = crypto.randomUUID();
  currentEntries = [
    ...currentEntries.slice(-3),
    { id, message: trimmed, variant },
  ];
  emit();
  scheduleDismiss(id, durationMs);

  return id;
}

export function useToast() {
  return {
    success: (message: string) => showToast(message, "success"),
    error: (message: string) => showToast(message, "error", 6000),
    info: (message: string) => showToast(message, "info"),
    dismiss: dismissToast,
  };
}

export function Toaster() {
  const copy = useUiCopy();
  const [entries, setEntries] = useState<readonly ToastEntry[]>(currentEntries);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listeners.add(setEntries);
    return () => {
      listeners.delete(setEntries);
    };
  }, []);

  useEffect(() => {
    const element = hostRef.current as
      | (HTMLDivElement & {
          showPopover?: () => void;
          hidePopover?: () => void;
        })
      | null;
    if (!element || typeof element.showPopover !== "function") {
      return;
    }

    try {
      const isOpen =
        typeof element.matches === "function" &&
        element.matches(":popover-open");
      const hasOpenDialog =
        typeof document !== "undefined" &&
        document.querySelector("dialog[open]") !== null;

      if (entries.length > 0) {
        if (isOpen && hasOpenDialog) {
          element.hidePopover?.();
          element.showPopover();
        } else if (!isOpen) {
          element.showPopover();
        }
      } else if (isOpen) {
        element.hidePopover?.();
      }
    } catch {
      // Fallback to regular fixed positioning if Popover API throws.
    }
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div
        ref={hostRef}
        popover="manual"
        className="hidden"
      />
    );
  }

  return (
    <div
      ref={hostRef}
      popover="manual"
      aria-label={copy("Системные уведомления")}
      className="pointer-events-none fixed inset-x-4 bottom-16 top-auto z-50 m-0 flex max-w-md flex-col gap-2 overflow-visible border-0 bg-transparent p-0 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-full sm:-translate-x-1/2"
    >
      {entries.map((entry) => {
        const Icon =
          entry.variant === "error"
            ? TriangleAlert
            : entry.variant === "info"
              ? Info
              : CheckCircle2;

        return (
          <div
            key={entry.id}
            role={entry.variant === "error" ? "alert" : "status"}
            aria-live={entry.variant === "error" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
              entry.variant === "error" && "border-destructive/40",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                entry.variant === "error"
                  ? "text-destructive"
                  : entry.variant === "info"
                    ? "text-muted-foreground"
                    : "text-emerald-600 dark:text-emerald-400",
              )}
            />
            <span className="min-w-0 flex-1 break-words">{entry.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-1 size-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={copy("Скрыть уведомление")}
              onClick={() => dismissToast(entry.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
