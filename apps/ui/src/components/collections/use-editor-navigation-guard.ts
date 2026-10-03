"use client";

import { useEffect, useLayoutEffect } from "react";

interface NavigateEvent extends Event {
  destination: { url: string; key: string };
  navigationType: string;
}
interface NavigationApi extends EventTarget {
  navigate: (url: string, options?: { history: "replace" | "push" }) => unknown;
  traverseTo: (key: string) => unknown;
}
interface Guard {
  element: HTMLDialogElement;
  dirty: boolean;
  busy: boolean;
  ask: (resume: () => void) => void;
  discard: () => void;
}
const guards = new Set<Guard>();
let approved = false;

function activeGuards() {
  return [...guards].filter((guard) => guard.element.open && guard.element.isConnected);
}
function block(resume: () => void) {
  const active = activeGuards();
  if (!active.length || approved || !active.some((guard) => guard.dirty || guard.busy))
    return false;
  if (active.some((guard) => guard.busy)) return true;
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  const top = active
    .sort((a, b) => dialogs.indexOf(a.element) - dialogs.indexOf(b.element))
    .at(-1)!;
  top.ask(() => {
    approved = true;
    for (const guard of active) guard.discard();
    resume();
  });
  return true;
}

/** Programmatic navigation must use the same guard as links and browser history. */
export function navigateWithEditorGuard(resume: () => void) {
  if (!block(resume)) resume();
}

// Navigation API fires before a same-document history traversal, so cancelling
// it preserves both the URL and the mounted Next editor. No sentinel history
// entries or Back/Forward loops are inserted.
export function useEditorNavigationGuard(
  element: HTMLDialogElement | null,
  enabled: boolean,
  dirty: boolean,
  busy: boolean,
  ask: (resume: () => void) => void,
  discard: () => void,
) {
  useLayoutEffect(() => {
    if (!element || !enabled) return;
    const guard = { element, dirty, busy, ask, discard };
    guards.add(guard);
    return () => {
      guards.delete(guard);
    };
  }, [element, enabled, dirty, busy, ask, discard]);

  useEffect(() => {
    if (!element || !enabled) return;
    const navigation = (window as Window & { navigation?: NavigationApi }).navigation;
    const navigate = (raw: Event) => {
      const event = raw as NavigateEvent;
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        event.destination.url === window.location.href
      )
        return;
      if (
        block(() => {
          if (event.navigationType === "traverse" && event.destination.key)
            navigation!.traverseTo(event.destination.key);
          else
            navigation!.navigate(event.destination.url, {
              history: event.navigationType === "replace" ? "replace" : "push",
            });
        })
      )
        event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      if (
        anchor.href !== window.location.href &&
        block(() => window.location.assign(anchor.href))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!approved && activeGuards().some((entry) => entry.dirty || entry.busy)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const reset = () => {
      approved = false;
    };
    navigation?.addEventListener("navigate", navigate);
    navigation?.addEventListener("navigatesuccess", reset);
    navigation?.addEventListener("navigateerror", reset);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      navigation?.removeEventListener("navigate", navigate);
      navigation?.removeEventListener("navigatesuccess", reset);
      navigation?.removeEventListener("navigateerror", reset);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      if (!guards.size) approved = false;
    };
  }, [element, enabled]);
}
