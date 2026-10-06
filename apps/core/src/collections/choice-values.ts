import type { FieldPresentation } from "./field-presentation-validation.js";

export function assertChoiceValue(
  value: unknown,
  presentation?: Partial<FieldPresentation> | null,
  required = false,
) {
  if (
    !presentation ||
    !["select", "multiselect"].includes(presentation.interface ?? "")
  )
    return;
  const values = presentation.interface === "multiselect" ? value : [value];
  if (
    !Array.isArray(values) ||
    (required && !values.length) ||
    values.length > 100 ||
    new Set(values).size !== values.length ||
    values.some(
      (v) =>
        (presentation.interface === "multiselect"
          ? typeof v !== "string"
          : !["string", "number"].includes(typeof v)) ||
        !presentation.options?.some((o) => o.value === v),
    )
  ) {
    throw new Error("Value is not one of the configured choices");
  }
}
