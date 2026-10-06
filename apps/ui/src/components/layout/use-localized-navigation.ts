"use client";

import {
  resolveLocalizedText,
  type LabelTranslations,
} from "@asmblyr-collaborative/contracts";
import { translationMessages } from "@asmblyr-collaborative/contracts/translations";
import {
  useTranslations,
  useTranslationCatalogs,
} from "@asmblyr-collaborative/kit/ui/i18n";

export function useLocalizedNavigation<
  T extends {
    name: string;
    displayName?: string | null;
    translations?: LabelTranslations;
  },
>(collections: readonly T[]): T[] {
  const { locale } = useTranslations();
  const catalogs = useTranslationCatalogs();
  const plugins = Object.entries(catalogs)
    .filter(([name]) => name.startsWith("plugin."))
    .map(([name, translations]) => ({
      namespace: name.slice(7),
      translations,
    }));
  return collections.map((collection) => {
    const plugin = plugins
      .filter((plugin) =>
        collection.name.startsWith(`plugin_${plugin.namespace}_`),
      )
      .sort((a, b) => b.namespace.length - a.namespace.length)[0];
    const localName = plugin
      ? collection.name.slice(`plugin_${plugin.namespace}_`.length)
      : collection.name;
    const messages = translationMessages(plugin?.translations, locale);
    const fallback =
      messages[`collection.${localName}.label`] ??
      collection.displayName ??
      collection.name;
    return {
      ...collection,
      displayName: resolveLocalizedText(
        collection.translations,
        locale,
        "label",
        fallback,
      ),
    };
  });
}
