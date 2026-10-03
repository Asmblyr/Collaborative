import type { FieldPresentation } from "@asmblyr/contracts";
export type { FieldPresentation } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";
import { parseConstraints } from "./content-values.js";
import { parseRelationPresentation } from "./relation-presentation.js";
import { parseRepeater } from "./repeater.js";
import { parseValueDisplay } from "./value-display.js";
import { parseFieldExtension } from "./field-extension.js";

export function parseFieldPresentation(
  body: unknown,
  type: string,
): FieldPresentation | Record<string, never> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CollectionInputError("Expected field presentation settings");
  }
  const value = body as Record<string, unknown>;
  const allowed = [
    "label",
    "description",
    "placeholder",
    "interface",
    "width",
    "order",
    "group",
    "options",
    "constraints",
    "relation",
    "repeater",
    "display",
    "extension",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new CollectionInputError("Unknown field presentation setting");
  }
  // Empty PUT resets to the existing UI behavior; omitted settings use defaults.
  if (!Object.keys(value).length) return {};
  if (value.relation !== undefined && type !== "alias")
    throw new CollectionInputError(
      "Relation display requires a to-many relation",
    );
  function text(key: string, max: number): string {
    if (value[key] === undefined) return "";
    if (
      typeof value[key] !== "string" ||
      value[key].length > max ||
      value[key].includes("\0")
    ) {
      throw new CollectionInputError(
        `Invalid ${key}; maximum ${max} characters`,
      );
    }
    return value[key].trim();
  }
  const editor = value.interface ?? "auto";
  if (value.extension !== undefined && editor !== "auto") {
    throw new CollectionInputError(
      "A field extension requires the automatic fallback interface",
    );
  }
  if (
    typeof editor !== "string" ||
    ![
      "auto",
      "input",
      "textarea",
      "select",
      "multiselect",
      "markdown",
      "richtext",
      "url",
      "repeater",
    ].includes(editor) ||
    (["markdown", "richtext", "url"].includes(editor) && type !== "text") ||
    (editor === "textarea" && type !== "text") ||
    (editor === "input" &&
      !["text", "email", "integer", "decimal"].includes(type)) ||
    (editor === "select" && type !== "text") ||
    (["multiselect", "repeater"].includes(editor) && type !== "json")
  ) {
    throw new CollectionInputError(
      "The selected interface is incompatible with this field type",
    );
  }
  const width = value.width ?? "full";
  if (width !== "full" && width !== "half")
    throw new CollectionInputError("Invalid field width");
  const order = value.order ?? 0;
  if (
    typeof order !== "number" ||
    !Number.isInteger(order) ||
    order < -10000 ||
    order > 10000
  ) {
    throw new CollectionInputError(
      "Field order must be an integer from -10000 to 10000",
    );
  }
  let options: FieldPresentation["options"];
  if (editor === "select" || editor === "multiselect") {
    if (
      !Array.isArray(value.options) ||
      !value.options.length ||
      value.options.length > 100 ||
      value.options.some(
        (v) =>
          !v ||
          typeof v !== "object" ||
          Array.isArray(v) ||
          Object.keys(v).some((key) => !["value", "label"].includes(key)) ||
          typeof v.value !== "string" ||
          !v.value.trim() ||
          v.value.length > 120 ||
          v.value.includes("\0") ||
          typeof v.label !== "string" ||
          !v.label.trim() ||
          v.label.length > 120 ||
          v.label.includes("\0"),
      )
    ) {
      throw new CollectionInputError(
        "Supply 1–100 distinct choices with value and label",
      );
    }
    options = value.options.map((v: { value: string; label: string }) => ({
      value: v.value,
      label: v.label.trim(),
    }));
    if (new Set(options.map((o) => o.value)).size !== options.length)
      throw new CollectionInputError("Duplicate choice values");
  } else if ("options" in value)
    throw new CollectionInputError("Choices require a select interface");
  if (value.repeater !== undefined && editor !== "repeater")
    throw new CollectionInputError(
      "Repeater settings require the repeater interface",
    );
  return {
    label: text("label", 120),
    description: text("description", 1000),
    placeholder: text("placeholder", 255),
    group: text("group", 120),
    interface: editor as FieldPresentation["interface"],
    width,
    order,
    ...(value.extension === undefined
      ? {}
      : { extension: parseFieldExtension(value.extension, type) }),
    ...(options ? { options } : {}),
    ...(value.constraints === undefined
      ? {}
      : { constraints: parseConstraints(value.constraints, type) }),
    ...(editor === "repeater"
      ? { repeater: parseRepeater(value.repeater) }
      : {}),
    ...(value.display === undefined
      ? {}
      : { display: parseValueDisplay(value.display, type) }),
    ...(value.relation === undefined
      ? {}
      : { relation: parseRelationPresentation(value.relation) }),
  };
}
