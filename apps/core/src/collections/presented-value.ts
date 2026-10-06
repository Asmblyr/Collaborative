import { assertChoiceValue } from "./choice-values.js";
import { parseTags } from "@asmblyr-collaborative/contracts";
import { parseContentValue } from "./content-values.js";
import { parseRepeaterValue } from "./repeater.js";
import type { FieldPresentation } from "./field-presentation-validation.js";
import type { JsonValue } from "./structured-values.js";

export function parsePresentedValue(
  value: JsonValue,
  presentation?: Partial<FieldPresentation>,
  required = false,
): JsonValue {
  if (presentation?.interface === "tags") {
    return parseTags(value, required);
  }
  assertChoiceValue(value, presentation, required);
  if (presentation?.interface === "repeater" && presentation.repeater)
    return parseRepeaterValue(value, presentation.repeater, required);
  return typeof value === "string" || typeof value === "number"
    ? parseContentValue(value, presentation, required)
    : value;
}
