import type { FieldPresentation } from "./index.js";
import type { LabelTranslations, UiLocale } from "./localization.js";
import type {
  TranslationCatalogs,
  TranslationsResult,
} from "./translations.js";

export interface TranslatableCollection {
  name: string;
  displayName?: string | null;
  translations?: LabelTranslations;
  fields: readonly { name: string; presentation?: FieldPresentation }[];
  primaryKey: { name: string };
  timestamps: { createdAt: boolean; updatedAt: boolean };
}
export function collectionLabels(
  collection: TranslatableCollection,
  locale: UiLocale,
  plugins?: readonly {
    namespace: string;
    translations?: TranslationCatalogs;
  }[],
): TranslationsResult["data"]["schema"][string];
