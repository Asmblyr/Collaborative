import { translateCopy } from "@asmblyr-collaborative/contracts/translations";
import type { UiLocale } from "@asmblyr-collaborative/contracts";

export type UiCopy = ((
  source: string,
  values?: Record<string, unknown>,
) => string) & { readonly locale?: UiLocale };

/** Legacy callers and pure model tests use the original Russian copy. */
export const originalCopy: UiCopy = (source, values) =>
  translateCopy(source, "ru", values);
