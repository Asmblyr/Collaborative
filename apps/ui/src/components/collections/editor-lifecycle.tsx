"use client";

import { createContext, useContext, useId, useLayoutEffect, useState } from "react";

export interface EditorState {
  dirty: boolean;
  busy: boolean;
}
export type RegisterEditorState = (id: string, state: EditorState | null) => void;
export const EditorLifecycleContext = createContext<RegisterEditorState | null>(null);

export function useEditorState(dirty: boolean, busy: boolean): void {
  const register = useContext(EditorLifecycleContext);
  const id = useId();
  useLayoutEffect(() => {
    register?.(id, { dirty, busy });
    return () => register?.(id, null);
  }, [register, id, dirty, busy]);
}

// Forms pass only their editable values. Tab changes, validation messages and
// selection state are not changes to the draft. A remounted form starts fresh.
export function useEditorDraft(values: unknown, busy: boolean): void {
  const serialized = JSON.stringify(values);
  const [initial] = useState(serialized);
  useEditorState(serialized !== initial, busy);
}
