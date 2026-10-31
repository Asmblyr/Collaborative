import {
  pluralizeCopy,
  translateCopy,
  type PluralForms,
} from "@asmblyr-collaborative/contracts/translations";
import type { UiLocale } from "@asmblyr-collaborative/contracts";

export type UiCopy = ((
  source: string,
  values?: Record<string, unknown>,
) => string) & {
  readonly locale?: UiLocale;
  readonly plural?: (
    count: number,
    forms: PluralForms,
    values?: Record<string, unknown>,
  ) => string;
};

/** Legacy callers and pure model tests use the original Russian copy. */
export const originalCopy: UiCopy = Object.assign(
  (source: string, values?: Record<string, unknown>) =>
    translateCopy(source, "ru", values),
  {
    locale: "ru" as const,
    plural: (
      count: number,
      forms: PluralForms,
      values?: Record<string, unknown>,
    ) => pluralizeCopy(count, forms, "ru", values),
  },
);

export function pluralCopy(
  copy: UiCopy,
  count: number,
  forms: PluralForms,
  values?: Record<string, unknown>,
): string {
  if (copy.plural) {
    return copy.plural(count, forms, values);
  }
  return pluralizeCopy(count, forms, copy.locale ?? "ru", values);
}
