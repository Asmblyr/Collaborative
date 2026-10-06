import {
  uiLocales,
  type LabelTranslations,
} from "@asmblyr-collaborative/contracts";
import { CollectionInputError } from "./validation.js";

export function parseLabelTranslations(
  input: unknown,
  collection = false,
): LabelTranslations {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CollectionInputError("Expected translation map");
  }
  const output: LabelTranslations = {};
  for (const [locale, raw] of Object.entries(input)) {
    if (!uiLocales.some((value) => value === locale)) {
      throw new CollectionInputError("Unsupported translation locale");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new CollectionInputError("Expected translated labels");
    }
    const labels: Record<string, string> = {};
    const limits: Record<string, number> = collection
      ? { label: 120 }
      : { label: 120, description: 1000, placeholder: 255 };
    for (const [key, value] of Object.entries(raw)) {
      if (
        !Object.hasOwn(limits, key) ||
        typeof value !== "string" ||
        value.length > limits[key] ||
        value.includes("\0")
      ) {
        throw new CollectionInputError("Invalid translated label");
      }
      if (value.trim()) {
        labels[key] = value.trim();
      }
    }
    if (Object.keys(labels).length) {
      output[locale as keyof LabelTranslations] = labels;
    }
  }
  return output;
}
