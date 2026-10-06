export const uiLocales: readonly ["ru", "en"];
export const themeStyles: readonly ["neutral", "ocean", "coral"];
export type UiLocale = (typeof uiLocales)[number];
export type ThemeStyle = (typeof themeStyles)[number];
export type ThemeMode = "light" | "dark" | "system";
/** Display metadata only. Technical identifiers and item values remain unchanged. */
export type LabelTranslations = Partial<
  Record<
    UiLocale,
    {
      label?: string;
      description?: string;
      placeholder?: string;
    }
  >
>;
export interface UserPreferences {
  theme: ThemeMode | null;
  style: ThemeStyle;
  locale: UiLocale;
}
export function resolveLocalizedText(
  translations: LabelTranslations | undefined,
  locale: UiLocale,
  key: "label" | "description" | "placeholder",
  fallback: string,
): string;
