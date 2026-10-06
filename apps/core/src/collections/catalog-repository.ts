import type { Knex } from "knex";
import type { Collection } from "./types.js";
import type { FieldPresentation } from "./field-presentation-validation.js";
import { fieldTypeFromDatabase } from "./field-types.js";
import { settingsFromRow } from "./settings-repository.js";
import type { JsonValue } from "./structured-values.js";
import { reconcileForm, type FormLayout } from "./form-layout.js";

interface CollectionRow {
  source_kind: "table" | "materialized-view";
  name: string;
  display_name: string | null;
  translations: import("@asmblyr-collaborative/contracts").LabelTranslations;
  hidden: boolean;
  mcp_enabled: boolean;
  mcp_description: string | null;
  display_field: string | null;
  display_template: string | null;
  form_layout: FormLayout | null;
  folder_id: string | null;
  parent_collection: string | null;
  created_at: Date;
  mode: "multiple" | "single";
  primary_key_name: string;
  primary_key_type: "uuid" | "serial" | "bigserial" | "text";
  created_at_enabled: boolean;
  updated_at_enabled: boolean;
  state: Collection["state"];
  column_name: string | null;
  data_type: string | null;
  is_nullable: "YES" | "NO" | null;
  semantic_type: string | null;
  required: boolean | null;
  default_value: JsonValue;
  searchable: boolean | null;
  search_priority:
    | import("@asmblyr-collaborative/contracts").SearchPriority
    | null;
  search_indexed: boolean;
  relation_target: string | null;
  relation_key_name: string | null;
  relation_key_type: Collection["primaryKey"]["type"] | null;
  on_delete: "restrict" | "setNull" | "setDefault" | "cascade" | null;
  relation_searchable: boolean | null;
  presentation: FieldPresentation | null;
}

interface AliasRow {
  collection_name: string;
  field_name: string;
  kind: "o2m" | "m2m";
  related_collection: string;
  through_collection: string;
  through_field: string;
  related_field: string | null;
  searchable: boolean;
  search_priority:
    | import("@asmblyr-collaborative/contracts").SearchPriority
    | null;
  presentation: FieldPresentation;
}

export async function listCollections(database: Knex): Promise<Collection[]> {
  const result = await database.raw<{ rows: CollectionRow[] }>(`
    SELECT m.source_kind, m.name, m.display_name, m.translations, m.hidden, m.mcp_enabled, m.mcp_description, m.folder_id, m.parent_collection, m.created_at, m.mode, m.display_field, m.display_template, m.form_layout, m.primary_key_name, m.primary_key_type,
      m.created_at_enabled, m.updated_at_enabled, m.state, c.column_name, c.data_type, c.is_nullable,
      fm.semantic_type, fm.required, fm.default_value, fm.searchable, fm.search_priority, fm.presentation,
      EXISTS (SELECT 1 FROM pg_class AS idx
        JOIN pg_namespace AS ns ON ns.oid = idx.relnamespace
        JOIN pg_index AS ix ON ix.indexrelid = idx.oid
        WHERE ns.nspname = 'public' AND idx.relname =
          'asmblyr_search_' || substr(md5(m.name || ':' || c.column_name), 1, 24)
          AND ix.indisvalid) AS search_indexed,
      r.target_collection AS relation_target,
      target.primary_key_name AS relation_key_name,
      target.primary_key_type AS relation_key_type, r.on_delete,
      r.searchable AS relation_searchable
    FROM public.asmblyr_collections AS m
    LEFT JOIN public.asmblyr_columns AS c
      ON c.table_schema = 'public'
      AND c.table_name = m.name
      AND c.column_name <> m.primary_key_name
      AND NOT (c.column_name = 'created_at' AND m.created_at_enabled)
      AND NOT (c.column_name = 'updated_at' AND m.updated_at_enabled)
    LEFT JOIN public.asmblyr_field_metadata AS fm
      ON fm.collection_name = m.name
      AND fm.field_name = c.column_name
    LEFT JOIN public.asmblyr_relations AS r
      ON r.source_collection = m.name AND r.source_field = c.column_name
    LEFT JOIN public.asmblyr_collections AS target
      ON target.name = r.target_collection
    ORDER BY m.folder_id NULLS FIRST, m.sort_order, m.name, c.ordinal_position
  `);

  const collections = new Map<string, Collection>();
  for (const row of result.rows) {
    let collection = collections.get(row.name);
    if (!collection) {
      collection = {
        name: row.name,
        folderId: row.folder_id,
        parentCollection: row.parent_collection,
        createdAt: row.created_at,
        ...settingsFromRow(row),
        fields: [],
      };
      collections.set(row.name, collection);
    }
    if (row.column_name && row.data_type) {
      collection.fields.push({
        name: row.column_name,
        type: row.relation_target
          ? "relation"
          : (fieldTypeFromDatabase(row.data_type, row.semantic_type) ??
            row.data_type),
        required: row.required ?? false,
        searchPriority: row.search_priority,
        nullable: row.is_nullable === "YES",
        ...(row.presentation && Object.keys(row.presentation).length
          ? { presentation: row.presentation }
          : {}),
        ...(row.default_value === null
          ? {}
          : { defaultValue: row.default_value }),
        ...(!row.relation_target &&
        ["text", "email"].includes(
          fieldTypeFromDatabase(row.data_type, row.semantic_type) ?? "",
        )
          ? {
              searchable: row.searchable ?? true,
              searchIndexed: row.search_indexed,
            }
          : {}),
        ...(row.relation_target &&
        row.relation_key_name &&
        row.relation_key_type
          ? {
              searchable: row.relation_searchable ?? false,
              relation: {
                kind: "m2o",
                collection: row.relation_target,
                primaryKey: {
                  name: row.relation_key_name,
                  type: row.relation_key_type,
                },
                onDelete: row.on_delete ?? "restrict",
              },
            }
          : {}),
      });
    }
  }
  const aliases = await database<AliasRow>({
    alias: "public.asmblyr_relation_aliases",
  })
    .select(
      "alias.collection_name",
      "alias.field_name",
      "kind",
      "related_collection",
      "through_collection",
      "through_field",
      "related_field",
      "alias.searchable",
      "alias.presentation",
      "fm.search_priority",
    )
    .leftJoin({ fm: "public.asmblyr_field_metadata" }, function () {
      this.on("fm.collection_name", "alias.collection_name").andOn(
        "fm.field_name",
        "alias.field_name",
      );
    })
    .orderBy("alias.field_name");
  for (const alias of aliases) {
    collections.get(alias.collection_name)?.fields.push({
      name: alias.field_name,
      type: "alias",
      required: false,
      nullable: true,
      searchable: alias.searchable,
      searchPriority: alias.search_priority,
      ...(Object.keys(alias.presentation).length
        ? { presentation: alias.presentation }
        : {}),
      relation: {
        kind: alias.kind,
        collection: alias.related_collection,
        throughCollection: alias.through_collection,
        throughField: alias.through_field,
        ...(alias.related_field ? { relatedField: alias.related_field } : {}),
      },
    });
  }
  return [...collections.values()].map((c) => ({
    ...c,
    formLayout: reconcileForm(
      c.formLayout,
      c.fields.map((f) => f.name),
    ),
  }));
}
