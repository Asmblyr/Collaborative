import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import type { CollectionData } from "../tools/collection-data.js";
import { parseItemFilters, type FilterGroup } from "../items/filter-input.js";
import { plainFilter } from "../items/filter-wire.js";
import { ItemError } from "../items/validation.js";
import { boundTerms, type BoundTerm } from "./repository.js";

export function termFilter(
  name: string,
  value: unknown,
  data: CollectionData,
  access: Access,
): FilterGroup {
  const filter = parseItemFilters(
    JSON.stringify(value),
    name,
    data.schema,
    data.allowed,
    data.catalog,
    access,
  );
  if (!filter.children.length)
    throw new ItemError("Добавьте хотя бы одно условие термина", 400);
  return filter;
}

export async function availableTerms(
  db: Knex,
  name: string,
  data: CollectionData,
  access: Access,
) {
  const terms = await boundTerms(db, data.schema.settings.internalId);
  return terms.flatMap((term) => {
    if (!term.enabled) return [];
    try {
      const filter = plainFilter(termFilter(name, term.filter, data, access));
      return [
        {
          id: term.id,
          name: term.name,
          description: term.description,
          aliases: term.aliases,
          filter,
        },
      ];
    } catch {
      // Neither a term nor its operands may reveal an unreadable field/relation.
      return [];
    }
  });
}

export async function describeTerms(
  db: Knex,
  name: string,
  data: CollectionData,
  access: Access,
) {
  const available = await availableTerms(db, name, data, access);
  const terms: typeof available = [];
  let size = 0;
  for (const term of available) {
    const length = JSON.stringify(term).length;
    if (size + length > 12_000) continue;
    terms.push(term);
    size += length;
  }
  return { terms, termsPartial: terms.length < available.length };
}

export async function applyTerms(
  db: Knex,
  name: string,
  ids: string[],
  rawFilter: string | undefined,
  data: CollectionData,
  access: Access,
): Promise<{
  filter: string | undefined;
  appliedTerms: { id: string; name: string; filter: object }[];
}> {
  if (!ids.length) return { filter: rawFilter, appliedTerms: [] };
  const available = await boundTerms(db, data.schema.settings.internalId);
  const selected = ids.map((id): BoundTerm => {
    const term = available.find((entry) => entry.id === id && entry.enabled);
    if (!term)
      throw new ItemError(
        "Term unavailable; describe the collection again",
        400,
      );
    return term;
  });
  const base = parseItemFilters(
    rawFilter,
    name,
    data.schema,
    data.allowed,
    data.catalog,
    access,
  );
  const groups = selected.map((term) =>
    termFilter(name, term.filter, data, access),
  );
  if (base.children.length) groups.unshift(base);
  // Flatten only AND roots; OR groups retain their meaning. The final parser
  // enforces the same combined depth/condition/size bounds as ordinary filters.
  const combined: FilterGroup = {
    logic: "and",
    children: groups.flatMap((group) =>
      group.logic === "and" ? group.children : [group],
    ),
  };
  const filter = JSON.stringify(plainFilter(combined));
  parseItemFilters(
    filter,
    name,
    data.schema,
    data.allowed,
    data.catalog,
    access,
  );
  return {
    filter,
    appliedTerms: selected.map((term) => ({
      id: term.id,
      name: term.name,
      filter: term.filter,
    })),
  };
}
