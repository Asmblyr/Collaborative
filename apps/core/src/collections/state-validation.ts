import type { CollectionState } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";

const colors = new Set(["gray", "blue", "green", "amber", "red", "violet"]);

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseCollectionState(value: unknown): CollectionState | null {
  if (value === undefined || value === null) return null;
  const input = object(value);
  if (
    !input ||
    Object.keys(input).some(
      (key) => !["field", "defaultValue", "statuses"].includes(key),
    ) ||
    input.field !== "status" ||
    typeof input.defaultValue !== "string" ||
    !Array.isArray(input.statuses) ||
    input.statuses.length < 1 ||
    input.statuses.length > 20
  ) {
    throw new CollectionInputError(
      "State needs field 'status', a defaultValue and 1–20 statuses",
    );
  }
  const values = new Set<string>();
  const statuses: CollectionState["statuses"] = input.statuses.map(
    (raw: unknown) => {
      const status = object(raw);
      if (
        !status ||
        Object.keys(status).some(
          (key) => !["value", "label", "color", "hidden"].includes(key),
        ) ||
        typeof status.value !== "string" ||
        !/^[a-z][a-z0-9_]{0,62}$/.test(status.value) ||
        values.has(status.value) ||
        typeof status.label !== "string" ||
        !status.label.trim() ||
        status.label.trim().length > 100 ||
        /[\u0000-\u001f\u007f]/.test(status.label) ||
        typeof status.color !== "string" ||
        !colors.has(status.color) ||
        typeof status.hidden !== "boolean"
      ) {
        throw new CollectionInputError(
          "Each state needs a unique code, label, color and hidden flag",
        );
      }
      values.add(status.value);
      return {
        value: status.value,
        label: status.label.trim(),
        color: status.color as CollectionState["statuses"][number]["color"],
        hidden: status.hidden,
      };
    },
  );
  if (!values.has(input.defaultValue))
    throw new CollectionInputError("Default state must be one of the statuses");
  return { field: "status", defaultValue: input.defaultValue, statuses };
}
