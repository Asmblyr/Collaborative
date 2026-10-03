import { playColumnPop, type ColumnCellSnapshot } from "./column-pop-effect";

function visibleCells(root: HTMLElement): ColumnCellSnapshot[] {
  const area = root.getBoundingClientRect();
  const rows = new Map<Element, DOMRect>();
  return Array.from(root.querySelectorAll<HTMLElement>("[data-column]")).flatMap((element) => {
    const row = element.parentElement!;
    let rowRect = rows.get(row);
    if (!rowRect) { rowRect = row.getBoundingClientRect(); rows.set(row, rowRect); }
    // Sticky headers can remain visible after their original row has scrolled away.
    if (element.tagName !== "TH" && (rowRect.bottom <= area.top || rowRect.top >= area.bottom)) return [];
    const rect = element.getBoundingClientRect();
    return rect.right > area.left && rect.left < area.right && rect.bottom > area.top && rect.top < area.bottom
      ? [{ element, rect }] : [];
  });
}

/** Preference changes commit immediately; temporary pixels only provide feedback. */
export function animateColumnVisibility(root: HTMLElement, layer: HTMLElement, name: string, show: boolean,
  commit: () => void): () => void {
  const view = root.ownerDocument.defaultView;
  const reduced = view?.matchMedia("(prefers-reduced-motion: reduce)");
  if (!view || reduced?.matches || typeof root.animate !== "function") {
    commit();
    return () => {};
  }

  let before: ColumnCellSnapshot[] = [];
  const animations = new Set<Animation>();
  let frame = 0;
  let timer = 0;
  let stopped = false;
  const track = (animation: Animation) => { animations.add(animation); };

  function stop() {
    if (stopped) return;
    stopped = true;
    view!.cancelAnimationFrame(frame);
    view!.clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer.replaceChildren();
    root.removeEventListener("scroll", stop, true);
    view!.removeEventListener("resize", stop);
    reduced?.removeEventListener("change", stop);
  }

  try {
    before = visibleCells(root);
    root.addEventListener("scroll", stop, true);
    view.addEventListener("resize", stop);
    reduced?.addEventListener("change", stop);
    if (!show) playColumnPop(layer, before.filter(({ element }) => element.dataset.column === name),
      root.getBoundingClientRect(), track);
  } catch { stop(); } // Decorative failures must never prevent a preference change.
  try { commit(); }
  catch (error) { stop(); throw error; }
  if (stopped) return stop;

  frame = view.requestAnimationFrame(() => {
    if (stopped || !root.isConnected) { stop(); return; }
    try {
      const old = new Map(before.map(({ element, rect }) => [element, rect]));
      for (const { element, rect } of visibleCells(root)) {
        const previous = old.get(element);
        if (show && element.dataset.column === name && !previous) {
          track(element.animate([
            { transform: "scale(0.9)", opacity: 0 }, { transform: "scale(1)", opacity: 1 },
          ], { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }));
        } else if (previous && rect.width > 0) {
          const shift = previous.left - rect.left;
          const scale = previous.width / rect.width;
          if (Math.abs(shift) < 0.5 && Math.abs(scale - 1) < 0.01) continue;
          track(element.animate([
            { transform: `translateX(${shift}px) scaleX(${scale})`, transformOrigin: "left center" },
            { transform: "none", transformOrigin: "left center" },
          ], { duration: 240, delay: show ? 0 : 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" }));
        }
      }
    } catch { stop(); }
  });
  // Bound lifetime also covers interrupted animation and a suspended tab.
  timer = view.setTimeout(stop, 600);
  return stop;
}
