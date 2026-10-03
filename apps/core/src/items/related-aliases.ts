import { applyRowAccess } from "../permissions/row-access.js";
import { getItem } from "./service.js";
import type { Knex } from "knex";
import { grantFor, type Access } from "../permissions/access.js";
import { collectionSchema } from "./schema-repository.js";
import { resolveRecordLabels } from "./record-labels.js";
import type { FieldPresentation } from "../collections/field-presentation-validation.js";

export interface AliasRow {
  collection_name: string;
  field_name: string;
  kind: "o2m" | "m2m";
  related_collection: string;
  through_collection: string;
  through_field: string;
  related_field: string | null;
  presentation?: FieldPresentation;
}

export async function relatedAliases(
  database: Knex,
  collection: string,
  id: string,
  access: Access,
) {
  const aliases = await database<AliasRow>("asmblyr_relation_aliases")
    .withSchema("public")
    .where({ collection_name: collection })
    .orderBy("field_name")
    .select(
      "collection_name",
      "field_name",
      "kind",
      "related_collection",
      "through_collection",
      "through_field",
      "related_field",
    );
  await getItem(
    database,
    collection,
    id,
    grantFor(access, collection, "read") ?? [],
    undefined,
    access,
  );
  // Alias fields are not stored columns; check their per-row scope separately.
  const groups: {
    sourceCollection: string;
    sourceField: string;
    aliasName?: string;
    items: { id: string; label: string }[];
    hasMore: boolean;
  }[] = [];
  for (const alias of aliases) {
    const parentQuery = database(collection)
      .withSchema("public")
      .where(
        (await collectionSchema(database, collection)).settings.primaryKey.name,
        id,
      );
    applyRowAccess(parentQuery, database, access, collection, "read", [
      alias.field_name,
    ]);
    if (!(await parentQuery.first())) continue;
    const allowed = grantFor(access, alias.related_collection, "read");
    if (!allowed) continue;
    if (
      alias.kind === "o2m" &&
      !allowed.includes("*") &&
      !allowed.includes(alias.through_field)
    )
      continue;
    const schema = await collectionSchema(database, alias.related_collection);
    const key = schema.settings.primaryKey.name;
    let rows: Record<string, unknown>[];
    if (alias.kind === "m2m") {
      if (!alias.related_field) continue;
      rows = await database({ j: `public.${alias.through_collection}` })
        .join(
          { t: `public.${alias.related_collection}` },
          `j.${alias.related_field}`,
          `t.${key}`,
        )
        .where(`j.${alias.through_field}`, id)
        .modify((query) => {
          applyRowAccess(
            query,
            database,
            access,
            alias.related_collection,
            "read",
            [],
            "t",
          );
          if (access.rowRules?.has(`${alias.through_collection}:read`))
            applyRowAccess(
              query,
              database,
              access,
              alias.through_collection,
              "read",
              [],
              "j",
            );
        })
        .select({ [key]: `t.${key}` })
        .orderBy(`t.${key}`)
        .limit(21);
    } else {
      rows = await database(alias.related_collection)
        .withSchema("public")
        .where(alias.through_field, id)
        .modify((query) =>
          applyRowAccess(
            query,
            database,
            access,
            alias.related_collection,
            "read",
            [alias.through_field],
          ),
        )
        .select(key)
        .orderBy(key)
        .limit(21);
    }
    const labels = await resolveRecordLabels(
      database,
      alias.related_collection,
      rows.slice(0, 20).map((row) => String(row[key])),
      access,
    );
    groups.push({
      sourceCollection: alias.related_collection,
      sourceField: alias.field_name,
      aliasName: alias.field_name,
      items: rows.slice(0, 20).map((row) => ({
        id: String(row[key]),
        label: labels[String(row[key])] ?? String(row[key]),
      })),
      hasMore: rows.length > 20,
    });
  }
  return { groups, aliases };
}
