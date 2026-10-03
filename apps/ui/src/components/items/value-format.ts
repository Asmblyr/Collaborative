import type { ValueDisplay } from "./presentation-types";

// Decimal values remain strings: no conversion through IEEE-754, even for rounding.
export function formatExactNumber(
  value: string | number,
  decimals: number,
  grouping: boolean,
): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return String(value);
  const [, sign, integer, fraction = ""] = match;
  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  let scaled = BigInt(integer + kept);
  if (Number(fraction[decimals] ?? 0) >= 5) scaled += BigInt(1);
  const digits = String(scaled).padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  return `${scaled === BigInt(0) ? "" : sign}${grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") : whole}${decimals ? `,${digits.slice(-decimals)}` : ""}`;
}

export function formattedValue(
  value: unknown,
  display?: ValueDisplay,
): string | null {
  if (value === null || value === undefined || !display) return null;
  if (
    display.kind === "number" &&
    (typeof value === "string" || typeof value === "number")
  ) {
    return (
      display.prefix +
      formatExactNumber(value, display.decimals, display.grouping) +
      display.suffix
    );
  }
  if (display.kind === "date" && typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: display.timeZone,
      ...(display.format !== "time" ? { dateStyle: "medium" as const } : {}),
      ...(display.format !== "date" ? { timeStyle: "short" as const } : {}),
    }).format(date);
  }
  return null;
}
