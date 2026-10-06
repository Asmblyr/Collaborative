import { resolveLocalizedText } from "./localization.js";
import {
  coreTranslations,
  translationMessages,
} from "./translation-messages.js";

/** Pure presentation projection shared by Core/API and browser UI. */
export function collectionLabels(collection, locale, plugins = []) {
  const owner = plugins
    .filter((plugin) =>
      collection.name.startsWith(`plugin_${plugin.namespace}_`),
    )
    .sort((a, b) => b.namespace.length - a.namespace.length)[0];
  const messages = translationMessages(owner?.translations, locale);
  const localName = owner
    ? collection.name.slice(`plugin_${owner.namespace}_`.length)
    : collection.name;
  const baseLabel =
    messages[`collection.${localName}.label`] ??
    collection.displayName ??
    collection.name;
  const fields = Object.fromEntries(
    collection.fields.map((field) => {
      const prefix = `field.${localName}.${field.name}`;
      const presentation = field.presentation;
      const fallback = (key) =>
        messages[`${prefix}.${key}`] ?? presentation?.[key] ?? "";
      return [
        field.name,
        {
          label: resolveLocalizedText(
            presentation?.translations,
            locale,
            "label",
            fallback("label") || field.name,
          ),
          description: resolveLocalizedText(
            presentation?.translations,
            locale,
            "description",
            fallback("description"),
          ),
          placeholder: resolveLocalizedText(
            presentation?.translations,
            locale,
            "placeholder",
            fallback("placeholder"),
          ),
        },
      ];
    }),
  );
  const core = coreTranslations[locale];
  fields[collection.primaryKey.name] = { label: core["system.id"] };
  for (const [enabled, name] of [
    [collection.timestamps.createdAt, "created_at"],
    [collection.timestamps.updatedAt, "updated_at"],
  ]) {
    if (enabled) {
      fields[name] = { label: core[`system.${name}`] };
    }
  }
  return {
    label: resolveLocalizedText(
      collection.translations,
      locale,
      "label",
      baseLabel,
    ),
    fields,
  };
}
