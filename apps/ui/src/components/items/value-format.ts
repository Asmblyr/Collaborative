import type { ValueDisplay } from "./presentation-types";
import type { UiLocale } from "@asmblyr-collaborative/contracts";

// Decimal values remain strings: no conversion through IEEE-754, even for rounding.
export function formatExactNumber(
  value: string | number,
  decimals: number,
  grouping: boolean,
  locale: UiLocale = "ru",
): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return String(value);
  const [, sign, integer, fraction = ""] = match;
  const kept = fraction.slice(0, decimals).padEnd(decimals, "0");
  let scaled = BigInt(integer + kept);
  if (Number(fraction[decimals] ?? 0) >= 5) scaled += BigInt(1);
  const digits = String(scaled).padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const separator = locale === "en" ? "," : "\u00a0";
  const decimalSeparator = locale === "en" ? "." : ",";
  return `${scaled === BigInt(0) ? "" : sign}${grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole}${decimals ? `${decimalSeparator}${digits.slice(-decimals)}` : ""}`;
}

export function formattedValue(
  value: unknown,
  display?: ValueDisplay,
  locale: UiLocale = "ru",
): string | null {
  if (value === null || value === undefined || !display) return null;
  if (
    display.kind === "number" &&
    (typeof value === "string" || typeof value === "number")
  ) {
    return (
      display.prefix +
      formatExactNumber(value, display.decimals, display.grouping, locale) +
      display.suffix
    );
  }
  if (display.kind === "date" && typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ru-RU", {
      timeZone: display.timeZone,
      ...(display.format !== "time" ? { dateStyle: "medium" as const } : {}),
      ...(display.format !== "date" ? { timeStyle: "short" as const } : {}),
    }).format(date);
  }
  return null;
}
