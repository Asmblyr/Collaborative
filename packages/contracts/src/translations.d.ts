import type { UiLocale } from "./localization.js";
export {
  collectionLabels,
  type TranslatableCollection,
} from "./schema-labels.js";

export type TranslationMessages = Readonly<Record<string, string>>;
export type TranslationCatalogs = Partial<
  Record<UiLocale, TranslationMessages>
>;
export const coreTranslations: Record<UiLocale, TranslationMessages>;
export function copyTranslationKey(source: string): string;
export function translateCopy(
  source: string,
  locale: UiLocale,
  values?: Record<string, unknown>,
): string;
export function translationMessages(
  catalogs: TranslationCatalogs | undefined,
  locale: UiLocale,
): Record<string, string>;

export interface TranslatedLabel {
  label: string;
  description?: string;
  placeholder?: string;
}

export interface TranslationsResult {
  data: {
    version: 1;
    locale: UiLocale;
    fallbackLocale: "ru";
    core: TranslationMessages;
    plugins: Record<string, TranslationMessages>;
    schema: Record<
      string,
      { label: string; fields: Record<string, TranslatedLabel> }
    >;
  };
}
