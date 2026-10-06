import type { Knex } from "knex";
import type { SearchPriority } from "@asmblyr-collaborative/contracts";
import { CollectionInputError } from "./validation.js";
import { templateFields } from "./label-template.js";

export function parseSearchPriority(value: unknown): SearchPriority | null {
  if (value === null || value === "primary" || value === "secondary") {
    return value;
  }
  throw new CollectionInputError(
    "Expected primary, secondary or null search priority",
  );
}

export async function saveSearchPriority(
  db: Knex,
  collection: string,
  field: string,
  value: SearchPriority | null,
): Promise<void> {
  await db("asmblyr_field_metadata")
    .withSchema("public")
    .insert({
      collection_name: collection,
      field_name: field,
      search_priority: value,
    })
    .onConflict(["collection_name", "field_name"])
    .merge({ search_priority: value });
}

export function primarySearchFields(
  settings: { displayField?: string | null; displayTemplate?: string | null },
  fields: Iterable<{ name: string; type: string | null }>,
): Set<string> {
  const names = settings.displayTemplate
    ? templateFields(settings.displayTemplate)
    : [];
  if (settings.displayField) {
    names.push(settings.displayField);
  }
  if (!names.length) {
    const first = [...fields].find(
      (field) => field.type === "text" || field.type === "email",
    );
    if (first) {
      names.push(first.name);
    }
  }
  return new Set(names.map((name) => name.split(".")[0]!));
}

export function searchPriorities(
  settings: { displayField?: string | null; displayTemplate?: string | null },
  fields: Iterable<{
    name: string;
    type: string | null;
    searchPriority?: SearchPriority | null;
  }>,
): Map<string, boolean> {
  const list = [...fields];
  const primary = primarySearchFields(settings, list);
  return new Map(
    list.map((field) => [
      field.name,
      field.searchPriority
        ? field.searchPriority === "primary"
        : primary.has(field.name),
    ]),
  );
}
