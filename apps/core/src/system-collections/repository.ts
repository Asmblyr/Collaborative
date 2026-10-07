import type { Knex } from "knex";
import type {
  SystemCollection,
  FieldPresentation,
} from "@asmblyr-collaborative/contracts";
import type { CustomFieldDefinition } from "./relations.js";
import { fieldTypeFromDatabase } from "../collections/field-types.js";
import { systemCollection, systemCollections } from "./registry.js";

export interface CustomFieldRow {
  collection_name: string;
  field_name: string;
  definition: CustomFieldDefinition;
  presentation: FieldPresentation;
}

export function customFields(db: Knex, name: string) {
  return db<CustomFieldRow>("public.asmblyr_system_fields").where({
    collection_name: name,
  });
}

export async function readSystemCollection(
  db: Knex,
  name: string,
): Promise<SystemCollection> {
  const collection = systemCollection(name);
  const [columns, custom] = await Promise.all([
    db("public.asmblyr_columns")
      .where({ table_schema: "public", table_name: collection.table })
      .orderBy("ordinal_position")
      .select("column_name", "data_type", "is_nullable"),
    customFields(db, name).select("field_name", "definition", "presentation"),
  ]);
  const owned = new Map(custom.map((field) => [field.field_name, field]));
  return {
    name: collection.name,
    fields: columns.map((column) => {
      const field = owned.get(column.column_name);
      if (field) {
        return {
          ...field.definition,
          type: field.definition.relation ? "relation" : field.definition.type,
          presentation: field.presentation,
          managed: false,
        };
      }
      return {
        name: column.column_name,
        type: fieldTypeFromDatabase(column.data_type) ?? column.data_type,
        required: column.is_nullable === "NO",
        nullable: column.is_nullable === "YES",
        managed: true,
      };
    }),
  };
}

export async function listSystemCollections(
  db: Knex,
): Promise<SystemCollection[]> {
  return Promise.all(
    systemCollections.map((entry) => readSystemCollection(db, entry.name)),
  );
}

export async function lockSystemCollection(
  db: Knex.Transaction,
  name: string,
  mode: "ACCESS EXCLUSIVE" | "ROW EXCLUSIVE" | "ACCESS SHARE",
) {
  const collection = systemCollection(name);
  await db.raw(`LOCK TABLE ?? IN ${mode} MODE`, [`public.${collection.table}`]);
  return collection;
}

export async function systemFileReferences(db: Knex, id: string) {
  const result: { collection: string; field: string; itemId: string }[] = [];
  const fields = await db<CustomFieldRow>(
    "public.asmblyr_system_fields",
  ).select("collection_name", "field_name", "definition");
  for (const field of fields) {
    if (field.definition.type !== "file" && field.definition.type !== "files") {
      continue;
    }
    const collection = systemCollection(field.collection_name);
    const query = db(collection.table).withSchema("public");
    if (field.definition.type === "file") {
      query.where(field.field_name, id);
    } else {
      query.whereRaw("?? @> ?::jsonb", [
        field.field_name,
        JSON.stringify([id]),
      ]);
    }
    const row = await query.first("id");
    if (row) {
      result.push({
        collection: `system:${collection.name}`,
        field: field.field_name,
        itemId: row.id,
      });
    }
  }
  return result;
}
