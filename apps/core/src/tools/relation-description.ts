import type { Knex } from "knex";
import type { Collection } from "../collections/types.js";
import { collectionSchema } from "../items/schema-repository.js";
import { resolveFilterField } from "../items/filter-fields.js";
import { grantFor, type Access } from "../permissions/access.js";
import type { CollectionData } from "./collection-data.js";

export function relationDescriptions(
  db: Knex,
  source: Collection,
  data: CollectionData,
  access: Access,
) {
  const schemas = new Map<string, ReturnType<typeof collectionSchema>>();
  return async (field: Collection["fields"][number]) => {
    const relation = field.relation;
    if (!relation) {
      return undefined;
    }
    const target = data.catalog.find(
      (entry) => entry.name === relation.collection,
    );
    const allowed = target && grantFor(access, target.name, "read");
    if (!target || !allowed) {
      return undefined;
    }
    const reference = {
      kind: relation.kind,
      collection: target.name,
      displayName: target.displayName || target.name,
      primaryKey: target.primaryKey,
    };
    if (relation.kind === "m2o") {
      return reference;
    }

    // A related read is advertised only when the ordinary filter resolver permits it.
    // Row-rule joins are deliberately unavailable, just as in item filtering.
    if (
      [source.name, target.name, relation.throughCollection].some((name) =>
        access.rowRules?.has(`${name}:read`),
      )
    ) {
      return reference;
    }
    const reverse = target.fields.find(
      (entry) =>
        entry.relation?.kind === "m2m" &&
        entry.relation.collection === source.name &&
        entry.relation.throughCollection === relation.throughCollection &&
        entry.relation.throughField === relation.relatedField &&
        entry.relation.relatedField === relation.throughField,
    );
    let filterField: string | null = null;
    if (relation.kind === "o2m" && relation.throughCollection === target.name) {
      filterField = relation.throughField;
    } else if (relation.kind === "m2m" && reverse) {
      filterField = `${reverse.name}.${source.primaryKey.name}`;
    }
    if (!filterField) {
      return reference;
    }
    try {
      let schema = schemas.get(target.name);
      if (!schema) {
        schema = collectionSchema(db, target.name);
        schemas.set(target.name, schema);
      }
      resolveFilterField(
        filterField,
        target.name,
        await schema,
        allowed,
        data.catalog,
        access,
      );
      return {
        ...reference,
        relatedRead: {
          collection: target.name,
          filterField,
          op: "eq",
          ...(relation.kind === "m2m" ? { quantifier: "some" } : {}),
          valueFrom: source.primaryKey.name,
        },
      };
    } catch {
      return reference;
    }
  };
}
