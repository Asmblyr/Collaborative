"use client";

import { useEffect, useRef } from "react";
import { animateColumnVisibility } from "./table-column-motion";

export function useColumnVisibilityMotion() {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);

  function change(name: string, show: boolean, commit: () => void) {
    cancel.current();
    if (!root.current || !layer.current) {
      commit();
      return;
    }
    cancel.current = animateColumnVisibility(
      root.current,
      layer.current,
      name,
      show,
      commit,
    );
  }

  return { root, layer, change };
}
