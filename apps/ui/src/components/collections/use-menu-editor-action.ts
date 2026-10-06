"use client";

import { useRef } from "react";

/** Close the menu before opening a native dialog, so its opener stays mounted. */
export function useMenuEditorAction() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<(() => void) | null>(null);

  function select(action: () => void) {
    actionRef.current = action;
  }

  function onCloseAutoFocus(event: Event) {
    const action = actionRef.current;
    actionRef.current = null;
    if (action) {
      event.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
      action();
    }
  }

  return { triggerRef, select, onCloseAutoFocus };
}
