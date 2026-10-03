export interface ColumnCellSnapshot {
  element: HTMLElement;
  rect: DOMRect;
}
export type TrackAnimation = (animation: Animation) => void;

const colors = [
  "oklch(0.82 0.10 165)",
  "oklch(0.84 0.09 20)",
  "oklch(0.87 0.10 85)",
];

function sprite(layer: HTMLElement, left: number, top: number, size: number) {
  const node = layer.ownerDocument.createElement("span");
  Object.assign(node.style, {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    pointerEvents: "none",
  });
  layer.append(node);
  return node;
}

export function playColumnPop(
  layer: HTMLElement,
  cells: ColumnCellSnapshot[],
  area: DOMRect,
  track: TrackAnimation,
) {
  const visible = cells.slice(0, 24);
  for (const { element, rect } of visible) {
    const style = getComputedStyle(element);
    const tile = layer.ownerDocument.createElement("div");
    const rowColor = getComputedStyle(element.parentElement!).backgroundColor;
    Object.assign(tile.style, {
      position: "absolute",
      left: `${rect.left - area.left + 2}px`,
      top: `${rect.top - area.top + 1}px`,
      width: `${Math.max(0, rect.width - 4)}px`,
      height: `${Math.max(0, rect.height - 2)}px`,
      boxSizing: "border-box",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      borderRadius: "999px",
      padding: style.padding,
      font: style.font,
      color: style.color,
      background: rowColor === "rgba(0, 0, 0, 0)" ? "var(--card)" : rowColor,
      boxShadow:
        "inset 0 0 0 1px color-mix(in oklch, var(--foreground) 8%, transparent)",
    });
    for (const child of element.childNodes) tile.append(child.cloneNode(true));
    for (const child of tile.querySelectorAll("[id]"))
      child.removeAttribute("id");
    layer.append(tile);
    track(
      tile.animate(
        [
          { transform: "scale(1)", opacity: 1, filter: "blur(0)" },
          { transform: "scale(1.04, 0.88)", offset: 0.22 },
          {
            transform: "scale(0.98, 1.15)",
            offset: 0.48,
            opacity: 1,
            filter: "blur(0)",
          },
          { transform: "scale(1.08, 1.20)", offset: 0.62, opacity: 0.85 },
          { transform: "scale(0.88)", opacity: 0, filter: "blur(3px)" },
        ],
        { duration: 200, easing: "ease-out", fill: "forwards" },
      ),
    );
  }

  const step = Math.max(1, Math.ceil(visible.length / 12));
  visible
    .filter((_, index) => index % step === 0)
    .forEach(({ rect }, index) => {
      const x = rect.left - area.left + rect.width / 2;
      const y = rect.top - area.top + rect.height / 2;
      if (index % 3 === 0) {
        const ring = sprite(layer, x - 12, y - 12, 24);
        ring.style.border = `2px solid ${colors[index % colors.length]}`;
        track(
          ring.animate(
            [
              { transform: "scale(0.4)", opacity: 0 },
              { transform: "scale(0.8)", opacity: 0.6, offset: 0.15 },
              { transform: "scale(2)", opacity: 0 },
            ],
            { duration: 260, delay: 90, easing: "ease-out", fill: "both" },
          ),
        );
      }
      for (let particle = 0; particle < 5; particle += 1) {
        const angle = (particle * Math.PI * 2) / 5 + index * 0.7;
        const distance = 24 + ((index + particle) % 3) * 14;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const size = 7 + ((index + particle) % 3) * 2;
        const crumb = sprite(layer, x - size / 2, y - size / 2, size);
        crumb.style.background = colors[(index + particle) % colors.length];
        track(
          crumb.animate(
            [
              { transform: "translate(0, 0) scale(0)", opacity: 0 },
              {
                transform: "translate(0, 0) scale(1.15)",
                opacity: 0.9,
                offset: 0.12,
              },
              {
                transform: `translate(${dx}px, ${dy}px) scale(0.9)`,
                opacity: 0.7,
                offset: 0.65,
              },
              {
                transform: `translate(${dx * 1.25}px, ${dy + 10}px) scale(0.15)`,
                opacity: 0,
              },
            ],
            {
              duration: 310 + particle * 15,
              delay: 90,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "both",
            },
          ),
        );
      }
    });
}
