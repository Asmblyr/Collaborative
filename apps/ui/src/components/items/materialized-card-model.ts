import { defaultPresentation } from "@/components/collections/field-presentation-defaults";
import type { UiLocale } from "@asmblyr-collaborative/contracts";
import type { CollectionField } from "./types";
import { formatExactNumber } from "./value-format";

export function materializedCardFields(
  fields: CollectionField[],
  sourceFields: CollectionField[],
  displayField?: string | null,
): CollectionField[] {
  const sources = new Map(sourceFields.map((field) => [field.name, field]));
  const lead =
    displayField ?? fields.find((field) => field.type === "text")?.name;

  return fields.map((field) => {
    const source = sources.get(field.name)?.presentation;
    const label = field.presentation?.label;
    const automaticLabel = field.name.replaceAll("_", " ");
    const hasCustomLabel = Boolean(
      source?.label || (label && label !== field.name),
    );
    const caption = hasCustomLabel
      ? label || source?.label || field.name
      : automaticLabel.charAt(0).toUpperCase() + automaticLabel.slice(1);
    const full =
      field.name === lead ||
      ["json", "file", "files"].includes(field.type) ||
      ["textarea", "markdown", "richtext", "repeater"].includes(
        field.presentation?.interface ?? "",
      );

    return {
      ...field,
      presentation: {
        ...defaultPresentation,
        ...field.presentation,
        label: caption,
        width: source?.width ?? (full ? "full" : "half"),
      },
    };
  });
}

export function materializedValueKind(
  field: CollectionField,
): "number" | "boolean" | null {
  const custom = Boolean(
    field.presentation?.sensitive ||
      field.presentation?.display ||
      field.presentation?.extension ||
      field.presentation?.options ||
      field.relation,
  );
  if (custom) {
    return null;
  }
  if (["integer", "bigint", "decimal"].includes(field.type)) {
    return "number";
  }
  return field.type === "boolean" ? "boolean" : null;
}

/** Group digits without rounding or passing decimal/bigint strings through Number. */
export function materializedNumber(
  value: string | number,
  locale: UiLocale,
): string {
  const text = String(value)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  const fraction = /^-?\d+\.(\d+)$/.exec(text)?.[1] ?? "";

  return formatExactNumber(text, fraction.length, true, locale);
}
