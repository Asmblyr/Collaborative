import { CollectionInputError } from "./validation.js";

export function templateFields(template: string): string[] {
  return [
    ...new Set(
      [
        ...template.matchAll(
          /\{\{\s*([a-z][a-z0-9_]{0,62}(?:\.[a-z][a-z0-9_]{0,62}){0,2})\s*\}\}/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
}

export function parseLabelTemplate(
  value: unknown,
  available: string[],
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500 || /[\0\r\n]/.test(value))
    throw new CollectionInputError(
      "Label template must be a single line, at most 500 characters",
    );
  const fields = templateFields(value);
  if (
    !fields.length ||
    fields.length > 8 ||
    fields.some((f) => !available.includes(f)) ||
    /[{}]/.test(
      value.replace(
        /\{\{\s*([a-z][a-z0-9_]{0,62}(?:\.[a-z][a-z0-9_]{0,62}){0,2})\s*\}\}/g,
        "",
      ),
    )
  ) {
    throw new CollectionInputError(
      "Use up to 8 scalar field placeholders, e.g. {{title}} · {{code}}",
    );
  }
  return value.trim();
}

export function renderLabelTemplate(
  template: string | null | undefined,
  row: Record<string, unknown>,
): string | null {
  if (!template) return null;
  const fields = templateFields(template);
  if (
    !fields.length ||
    fields.some((f) => !Object.hasOwn(row, f)) ||
    fields.every((f) => row[f] == null || row[f] === "")
  )
    return null;
  return (
    template
      .replace(
        /\{\{\s*([a-z][a-z0-9_]{0,62}(?:\.[a-z][a-z0-9_]{0,62}){0,2})\s*\}\}/g,
        (_, field: string) => {
          const value = row[field];
          return value instanceof Date
            ? value.toISOString()
            : ["string", "number", "boolean"].includes(typeof value)
              ? String(value)
              : "";
        },
      )
      .trim()
      .slice(0, 160) || null
  );
}
