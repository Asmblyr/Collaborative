export const uiLocales = ["ru", "en"];
export const themeStyles = ["neutral", "ocean", "coral"];

export function resolveLocalizedText(translations, locale, key, fallback) {
  const value = translations?.[locale]?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
