import { coreTranslations } from "./translation-messages.js";

/** Stable keys for built-in UI copy. Never apply this to user content. */
export function copyTranslationKey(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return `copy.${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function translateCopy(source, locale, values = {}) {
  const key = copyTranslationKey(source);
  const message = coreTranslations[locale]?.[key] ?? source;
  return message.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.hasOwn(values, name) ? String(values[name]) : match;
  });
}
