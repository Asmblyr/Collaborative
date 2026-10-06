import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
export type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import { parseLabelTranslations } from "./translation-validation.js";
import { CollectionInputError } from "./validation.js";
import { parseConstraints } from "./content-values.js";
import { parseRelationPresentation } from "./relation-presentation.js";
import { parseRepeater } from "./repeater.js";
import { parseValueDisplay } from "./value-display.js";
import { parseFieldChoices } from "./field-choices.js";
import { parseFieldRules, parseRelationChoiceFilter } from "./field-rules.js";
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
    "rules",
    "relationFilter",
    "sensitive",
    "translations",
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
      "tags",
      "markdown",
      "richtext",
      "url",
      "repeater",
    ].includes(editor) ||
    (["markdown", "richtext", "url"].includes(editor) && type !== "text") ||
    (editor === "textarea" && type !== "text") ||
    (editor === "input" &&
      !["text", "email", "integer", "bigint", "date", "decimal"].includes(
        type,
      )) ||
    (editor === "select" && !["text", "integer"].includes(type)) ||
    (["multiselect", "repeater", "tags"].includes(editor) && type !== "json")
  ) {
    throw new CollectionInputError(
      "The selected interface is incompatible with this field type",
    );
  }
  if (value.relationFilter !== undefined && type !== "relation")
    throw new CollectionInputError("Choice filters require an M2O field");
  if (
    value.sensitive !== undefined &&
    (typeof value.sensitive !== "boolean" || !["text", "email"].includes(type))
  )
    throw new CollectionInputError(
      "Sensitive history requires a text or email field",
    );
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
    options = parseFieldChoices(value.options, type);
  } else if ("options" in value)
    throw new CollectionInputError("Choices require a select interface");
  if (value.repeater !== undefined && editor !== "repeater")
    throw new CollectionInputError(
      "Repeater settings require the repeater interface",
    );
  return {
    ...(value.translations === undefined
      ? {}
      : { translations: parseLabelTranslations(value.translations) }),
    ...(value.rules === undefined
      ? {}
      : { rules: parseFieldRules(value.rules) }),
    ...(value.relationFilter === undefined
      ? {}
      : { relationFilter: parseRelationChoiceFilter(value.relationFilter) }),
    ...(value.sensitive === undefined ? {} : { sensitive: value.sensitive }),
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
