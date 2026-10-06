import {
  fieldConditionMatches,
  relationFilterDependencies,
} from "@asmblyr-collaborative/contracts";
import { inputValue } from "./item-input-values";
import type { Item, CollectionField } from "./types";

export function fieldIsRequired(
  field: CollectionField,
  values: Record<string, string>,
): boolean {
  const when = field.presentation?.rules?.requiredWhen;
  return (
    field.required ||
    !field.nullable ||
    Boolean(when && fieldConditionMatches(when, values))
  );
}

export function fieldIsReadonly(field: CollectionField): boolean {
  return Boolean(
    field.presentation?.rules?.readonly || field.presentation?.rules?.computed,
  );
}

/** Clear dependent references transitively only when a user changes their parent. */
export function changeFieldDraft(
  fields: CollectionField[],
  current: Record<string, string>,
  field: string,
  value: string,
): Record<string, string> {
  if (current[field] === value) {
    return current;
  }
  const next = { ...current, [field]: value };
  const changed = new Set([field]);
  for (let pass = 0; pass < fields.length; pass++) {
    let cleared = false;
    for (const candidate of fields) {
      const filter = candidate.presentation?.relationFilter;
      if (
        !filter ||
        changed.has(candidate.name) ||
        !relationFilterDependencies(filter).some((d) => changed.has(d))
      ) {
        continue;
      }
      next[candidate.name] = "";
      changed.add(candidate.name);
      cleared = true;
    }
    if (!cleared) {
      break;
    }
  }
  return next;
}

/** Conditions and choice operands see effective defaults and known, omitted parent fields. */
export function effectiveFieldDraft(
  fields: CollectionField[],
  values: Record<string, string>,
  editing: boolean,
  initialValues?: Item,
): Record<string, string> {
  const effective = Object.fromEntries(
    Object.entries(initialValues ?? {}).map(([name, value]) => [
      name,
      value == null ? "" : String(value),
    ]),
  );
  for (const field of fields) {
    const useDefault =
      !editing && values[field.name] === "" && field.defaultValue !== undefined;
    effective[field.name] = useDefault
      ? inputValue(field, { [field.name]: field.defaultValue! })
      : values[field.name];
  }
  return effective;
}
