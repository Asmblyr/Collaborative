"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { EditorDiscardConfirmation } from "./editor-discard-confirmation";
import { useEditorNavigationGuard } from "./use-editor-navigation-guard";
import { EditorLifecycleContext, type EditorState } from "./editor-lifecycle";
import { useUiCopy } from "@/lib/ui-copy";

interface EditorDialogProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  size?: "default" | "relation" | "junction" | "record" | "wide";
  contentKey?: string;
  busy?: boolean;
  hasUnsavedChanges?: boolean;
  navigation?: ReactNode;
  onClose: (reason?: "navigation") => void;
  footer?: ReactNode | ((close: () => void) => ReactNode);
  children: (
    portalContainer: HTMLDialogElement | null,
    close: () => void,
    requestClose: () => void,
    requestLeave: (leave: () => void) => void,
  ) => ReactNode;
}

export function EditorDialog({
  open,
  title,
  eyebrow,
  size = "default",
  contentKey,
  busy: parentBusy = false,
  hasUnsavedChanges: parentDirty = false,
  navigation,
  onClose,
  footer,
  children,
}: EditorDialogProps) {
  const copy = useUiCopy();

  const [forms, setForms] = useState<Record<string, EditorState>>({});
  const registerState = useCallback((id: string, state: EditorState | null) => {
    setForms((current) => {
      const next = { ...current };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }, []);
  const busy = parentBusy || Object.values(forms).some((form) => form.busy);
  const hasUnsavedChanges =
    parentDirty || Object.values(forms).some((form) => form.dirty);
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const leaveRef = useRef<(() => void) | null>(null);
  const navigatingRef = useRef(false);
  const confirmNavigation = useCallback((resume: () => void) => {
    leaveRef.current = resume;
    setConfirmDiscard(true);
  }, []);
  const discardForNavigation = useCallback(() => {
    navigatingRef.current = true;
    element?.close();
  }, [element]);
  useEditorNavigationGuard(
    element,
    open && !closing,
    hasUnsavedChanges,
    busy,
    confirmNavigation,
    discardForNavigation,
  );

  useEffect(() => {
    if (!element) return;
    if (open && !element.open) {
      navigatingRef.current = false;
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      element.showModal();
    }
    if (!open && element.open) element.close();
  }, [open, element]);

  useEffect(() => {
    if (open && contentRef.current) contentRef.current.scrollTop = 0;
  }, [contentKey, open]);

  useEffect(() => {
    if (!closing || !element) return;
    // Also finish if an animation is interrupted or unavailable.
    const timeout = window.setTimeout(() => element.close(), 220);
    return () => window.clearTimeout(timeout);
  }, [closing, element]);

  function close() {
    if (!element?.open || closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      element.close();
    else setClosing(true);
  }

  function closed() {
    const opener = openerRef.current;
    setClosing(false);
    setConfirmDiscard(false);
    if (navigatingRef.current) {
      onClose("navigation");
      return;
    }
    onClose();
    // The parent first enables the opener or removes the completed editor.
    window.requestAnimationFrame(() => {
      if (
        opener?.isConnected &&
        (document.activeElement === document.body ||
          element?.contains(document.activeElement))
      )
        opener.focus({ preventScroll: true });
    });
  }

  function requestClose() {
    requestLeave(close);
  }

  function requestLeave(leave: () => void) {
    if (busy) return;
    if (hasUnsavedChanges) {
      leaveRef.current = leave;
      setConfirmDiscard(true);
    } else leave();
  }

  function continueEditing() {
    leaveRef.current = null;
    setConfirmDiscard(false);
    window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus({ preventScroll: true }),
    );
  }

  return (
    <dialog
      ref={setElement}
      className={`editor-dialog ${size === "default" ? "" : `editor-dialog--${size}`} overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl`}
      aria-labelledby={titleId}
      data-closing={closing || undefined}
      onKeyDown={(event) => {
        // Handle Escape before the native CloseWatcher: repeated Escape can
        // otherwise produce a non-cancelable close and discard a draft.
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          !(event.target instanceof Element) ||
          event.target.closest("dialog") !== event.currentTarget
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (confirmDiscard) continueEditing();
        else requestClose();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        if (confirmDiscard) continueEditing();
        else requestClose();
      }}
      onAnimationEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.animationName === "editor-dialog-exit"
        )
          element?.close();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        closed();
      }}
    >
      <div
        className="flex h-full min-h-0 flex-col"
        inert={closing || confirmDiscard}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h2
              id={titleId}
              className="break-words text-xl font-semibold"
            >
              {title}
            </h2>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || closing}
            className="shrink-0"
            onClick={requestClose}
            aria-label={copy("Закрыть редактор")}
          >
            {copy("Закрыть ")}
          </Button>
        </div>
        {open && navigation && (
          <div className="shrink-0 border-b px-6 pb-4 pt-3">{navigation}</div>
        )}
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <EditorLifecycleContext.Provider value={registerState}>
            {open && children(element, close, requestClose, requestLeave)}
          </EditorLifecycleContext.Provider>
        </div>
        {open && footer && (
          <div className="shrink-0 border-t bg-card px-6 py-4">
            {typeof footer === "function" ? footer(close) : footer}
          </div>
        )}
      </div>
      {confirmDiscard && (
        <EditorDiscardConfirmation
          onContinue={continueEditing}
          onDiscard={() => {
            const leave = leaveRef.current;
            leaveRef.current = null;
            setConfirmDiscard(false);
            if (leave) leave();
            else close();
          }}
        />
      )}
    </dialog>
  );
}
