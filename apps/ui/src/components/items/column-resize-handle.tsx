"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { columnWidthLimits } from "@asmblyr-collaborative/contracts";
import { useUiCopy } from "@/lib/ui-copy";
import { beginColumnResize, clampColumnWidth } from "./column-width";

interface Props {
  name: string;
  label: string;
  width: number;
  onResize: (name: string, width: number | undefined) => void;
}

export function ColumnResizeHandle({ name, label, width, onResize }: Props) {
  const copy = useUiCopy();
  const gesture = useRef<ReturnType<typeof beginColumnResize>>(null);
  const pointer = useRef<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(
    () => () => {
      gesture.current?.restore();
      gesture.current = null;
    },
    [width],
  );

  function finish(handle: HTMLElement, save: boolean) {
    const active = gesture.current;
    gesture.current = null;
    active?.restore();
    if (pointer.current !== null && handle.hasPointerCapture(pointer.current)) {
      handle.releasePointerCapture(pointer.current);
    }
    pointer.current = null;
    setPreview(null);
    if (save && active && active.width !== active.startWidth) {
      onResize(name, active.width);
    }
  }

  function start(event: PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    gesture.current = beginColumnResize(
      event.currentTarget,
      name,
      event.clientX,
    );
    if (gesture.current) {
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function keyboard(event: KeyboardEvent<HTMLSpanElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(event.currentTarget, false);
      return;
    }
    if (gesture.current) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onResize(name, undefined);
      return;
    }
    const next = {
      ArrowLeft: width - columnWidthLimits.step,
      ArrowRight: width + columnWidthLimits.step,
      Home: columnWidthLimits.min,
      End: columnWidthLimits.max,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      if (clampColumnWidth(next) !== width) {
        onResize(name, clampColumnWidth(next));
      }
    }
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={copy("Изменить ширину столбца {{value0}}", { value0: label })}
      aria-valuemin={columnWidthLimits.min}
      aria-valuemax={columnWidthLimits.max}
      aria-valuenow={preview ?? width}
      title={copy("Потяните для изменения ширины. Двойной щелчок — сброс.")}
      tabIndex={0}
      draggable={false}
      data-resizing={preview !== null || undefined}
      className="absolute inset-y-0 right-0 z-10 flex w-3 touch-none cursor-col-resize items-center justify-center outline-none before:h-4 before:w-px before:rounded-full before:bg-border hover:before:bg-primary focus-visible:before:w-0.5 focus-visible:before:bg-ring data-[resizing=true]:before:bg-primary"
      onPointerDown={start}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId && gesture.current) {
          event.preventDefault();
          setPreview(gesture.current.update(event.clientX));
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current === event.pointerId) {
          event.stopPropagation();
          gesture.current?.update(event.clientX);
          finish(event.currentTarget, true);
        }
      }}
      onPointerCancel={(event) => finish(event.currentTarget, false)}
      onLostPointerCapture={(event) => finish(event.currentTarget, false)}
      onKeyDown={keyboard}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize(name, undefined);
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
