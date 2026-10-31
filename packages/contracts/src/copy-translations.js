import { coreTranslations } from "./translation-messages.js";

const pluralRulesCache = new Map();

function getPluralRules(locale) {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

function interpolateCopy(message, values) {
  return message.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.hasOwn(values, name) ? String(values[name]) : match;
  });
}

/** Stable keys for built-in UI copy. Never apply this to user content. */
export function copyTranslationKey(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return `copy.${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function translateCopy(source, locale, values = {}) {
  const catalog = coreTranslations[locale];
  const exactKey = copyTranslationKey(source);
  const exactMatch = catalog?.[exactKey];
  if (exactMatch !== undefined) {
    return interpolateCopy(exactMatch, values);
  }

  const trimmed = source.trim();
  if (trimmed && trimmed !== source) {
    const trimmedKey = copyTranslationKey(trimmed);
    const trimmedMatch = catalog?.[trimmedKey];
    if (trimmedMatch !== undefined) {
      const leading = source.match(/^\s+/)?.[0] ?? "";
      const trailing = source.match(/\s+$/)?.[0] ?? "";
      return `${leading}${interpolateCopy(trimmedMatch, values)}${trailing}`;
    }
  }

  return interpolateCopy(source, values);
}

export function pluralizeCopy(count, forms, locale, values = {}) {
  const numericCount = Number.isFinite(count) ? count : 0;
  const category = getPluralRules(locale).select(Math.abs(numericCount));
  let template;

  if (category === "one") {
    template = forms.one;
  } else if (category === "few") {
    template = forms.few ?? forms.other ?? forms.many ?? forms.one;
  } else if (category === "many") {
    template = forms.many ?? forms.other ?? forms.few ?? forms.one;
  } else {
    template = forms.other ?? forms.many ?? forms.few ?? forms.one;
  }

  return translateCopy(template, locale, { count: numericCount, ...values });
}
