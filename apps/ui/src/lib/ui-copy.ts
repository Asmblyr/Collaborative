"use client";

import { useMemo } from "react";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { translateCopy } from "@asmblyr-collaborative/contracts/translations";

/** Translate application-owned copy, keeping user labels and values untouched. */
export function useUiCopy() {
  const { locale } = useTranslations();
  return useMemo(
    () =>
      Object.assign(
        (source: string, values?: Record<string, unknown>) =>
          translateCopy(source, locale, values),
        { locale },
      ),
    [locale],
  );
}
