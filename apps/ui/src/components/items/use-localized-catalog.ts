"use client";

import { useMemo } from "react";
import { collectionLabels } from "@asmblyr-collaborative/contracts/translations";
import {
  useTranslations,
  useTranslationCatalogs,
} from "@asmblyr-collaborative/kit/ui/i18n";
import { defaultPresentation } from "@/components/collections/field-presentation-defaults";
import type { TranslatableCollection } from "@asmblyr-collaborative/contracts/translations";

/** View-only copies. Structure editors keep original metadata when saving settings. */
export function useLocalizedCatalog<T extends TranslatableCollection>(
  catalog: readonly T[],
) {
  const { locale } = useTranslations();
  const resources = useTranslationCatalogs();
  return useMemo(() => {
    const catalogs = Object.entries(resources)
      .filter(([name]) => name.startsWith("plugin."))
      .map(([name, translations]) => ({
        namespace: name.slice(7),
        translations,
      }));
    return catalog.map((collection) => {
      const labels = collectionLabels(collection, locale, catalogs);
      return {
        ...collection,
        displayName: labels.label,
        fields: collection.fields.map((field) => ({
          ...field,
          presentation: {
            ...defaultPresentation,
            ...field.presentation,
            ...labels.fields[field.name],
          },
        })),
      };
    });
  }, [catalog, locale, resources]);
}
