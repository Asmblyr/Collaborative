import { applyRowAccess } from "../permissions/row-access.js";
import { getItem } from "./service.js";
import type { Knex } from "knex";
import { grantFor, requireGrant, type Access } from "../permissions/access.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { CollectionNotFoundError } from "../collections/validation.js";
import { collectionSchema } from "./schema-repository.js";
import { parseItemId } from "./validation.js";
import { relatedAliases } from "./related-aliases.js";
import { resolveRecordLabels } from "./record-labels.js";

interface RelationRow {
  source_collection: string;
  source_field: string;
  target_collection: string;
}

export async function requireRelatedRead(
  database: Knex,
  source: string,
  body: unknown,
  access: Access,
): Promise<void> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const values = body as Record<string, unknown>;
  const fields = Object.keys(values).filter((name) => values[name] !== null);
  if (fields.length === 0) return;
  const relations = await database<RelationRow>("asmblyr_relations")
    .withSchema("public")
    .where({ source_collection: source })
    .whereNull("target_system")
    .whereIn("source_field", fields)
    .select("target_collection", "source_field");
  for (const relation of relations) {
    const allowed = requireGrant(access, relation.target_collection, "read");
    if (access.rowRules?.has(`${relation.target_collection}:read`))
      await getItem(
        database,
        relation.target_collection,
        String(values[relation.source_field]),
        allowed,
        undefined,
        access,
      );
  }
}

export async function relatedItems(
  database: Knex,
  target: string,
  id: string,
  access: Access,
) {
  const settings = await findCollectionSettings(database, target);
  if (!settings) throw new CollectionNotFoundError(target);
  const itemId = parseItemId(id, settings.primaryKey.type);
  const relations = await database<RelationRow>("asmblyr_relations")
    .withSchema("public")
    .where({ target_collection: target })
    .orderBy("source_collection")
    .orderBy("source_field")
    .select("source_collection", "source_field");
  const { groups, aliases } = await relatedAliases(
    database,
    target,
    itemId,
    access,
  );
  for (const relation of relations) {
    if (
      aliases.some(
        (alias) =>
          alias.through_collection === relation.source_collection &&
          alias.through_field === relation.source_field,
      )
    )
      continue;
    const allowed = grantFor(access, relation.source_collection, "read");
    if (
      !allowed ||
      (!allowed.includes("*") && !allowed.includes(relation.source_field))
    )
      continue;
    const schema = await collectionSchema(database, relation.source_collection);
    const key = schema.settings.primaryKey.name;
    const rows = await database(relation.source_collection)
      .withSchema("public")
      .where(relation.source_field, itemId)
      .modify((query) =>
        applyRowAccess(
          query,
          database,
          access,
          relation.source_collection,
          "read",
          [relation.source_field],
        ),
      )
      .select(key)
      .orderBy(key)
      .limit(21);
    const labels = await resolveRecordLabels(
      database,
      relation.source_collection,
      rows.slice(0, 20).map((row: Record<string, unknown>) => String(row[key])),
      access,
    );
    groups.push({
      sourceCollection: relation.source_collection,
      sourceField: relation.source_field,
      items: rows.slice(0, 20).map((row: Record<string, unknown>) => ({
        id: String(row[key]),
        label: labels[String(row[key])] ?? String(row[key]),
      })),
      hasMore: rows.length > 20,
    });
  }
  return { data: groups };
}
