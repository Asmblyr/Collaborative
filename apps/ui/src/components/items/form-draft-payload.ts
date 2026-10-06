import { payloadValue } from "./item-input-values";
import type { CollectionField, ItemValue } from "./types";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export class FieldDraftError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export function formDraftPayload(
  fields: CollectionField[],
  values: Record<string, string>,
  copy: UiCopy = originalCopy,
): Record<string, ItemValue> {
  const payload: Record<string, ItemValue> = {};
  for (const field of fields) {
    try {
      payload[field.name] = payloadValue(field, values[field.name], copy);
      const repeater = field.presentation?.repeater;
      const rows = payload[field.name];
      if (
        field.presentation?.interface === "repeater" &&
        repeater &&
        rows !== null
      ) {
        if (
          !Array.isArray(rows) ||
          rows.length < Math.max(repeater.minItems, field.required ? 1 : 0) ||
          rows.length > repeater.maxItems
        ) {
          throw new Error(
            copy("Нужно от {{value0}} до {{value1}} элементов", {
              value0: Math.max(repeater.minItems, field.required ? 1 : 0),
              value1: repeater.maxItems,
            }),
          );
        }
        for (const [index, row] of rows.entries()) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error(
              copy("Элемент {{value0}} должен быть объектом", {
                value0: index + 1,
              }),
            );
          }
          for (const child of repeater.fields) {
            if (
              child.required &&
              (row[child.name] == null ||
                (typeof row[child.name] === "string" &&
                  !String(row[child.name]).trim()))
            ) {
              throw new Error(
                copy("Элемент {{value0}}: заполните {{value1}}", {
                  value0: index + 1,
                  value1: child.label || child.name,
                }),
              );
            }
          }
        }
      }
    } catch (cause) {
      throw new FieldDraftError(
        field.name,
        `${field.presentation?.label || field.name}: ${cause instanceof Error ? cause.message : copy("Проверьте значение")}`,
      );
    }
  }
  return payload;
}
