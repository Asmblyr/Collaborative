"use client";

import { useMemo } from "react";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import {
  pluralizeCopy,
  translateCopy,
  type PluralForms,
} from "@asmblyr-collaborative/contracts/translations";

/** Translate application-owned copy, keeping user labels and values untouched. */
export function useUiCopy() {
  const { locale } = useTranslations();
  return useMemo(
    () =>
      Object.assign(
        (source: string, values?: Record<string, unknown>) =>
          translateCopy(source, locale, values),
        {
          locale,
          plural: (
            count: number,
            forms: PluralForms,
            values?: Record<string, unknown>,
          ) => pluralizeCopy(count, forms, locale, values),
        },
      ),
    [locale],
  );
}
