import ru from "../locales/ru.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import uiRu from "../locales/ui.ru.json" with { type: "json" };
import uiEn from "../locales/ui.en.json" with { type: "json" };

export const coreTranslations = {
  ru: { ...ru, ...uiRu },
  en: { ...en, ...uiEn },
};

export function translationMessages(catalogs, locale) {
  return { ...catalogs?.ru, ...catalogs?.[locale] };
}
