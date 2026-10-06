import type { Knex } from "knex";
import { assertCollectionWritable } from "./source-access.js";
import type {
  CollectionMode,
  PrimaryKey,
  PrimaryKeyType,
  Timestamps,
} from "./types.js";
import type { FormLayout } from "./form-layout.js";
import type { CollectionState } from "@asmblyr-collaborative/contracts";
import { CollectionNotFoundError } from "./validation.js";
import { postgresCode } from "../shared/postgres-error.js";

export interface CollectionSettings {
  sourceKind?: "table" | "materialized-view";
  mode: CollectionMode;
  displayName?: string | null;
  translations?: import("@asmblyr-collaborative/contracts").LabelTranslations;
  hidden?: boolean;
  mcp?: { enabled: boolean; description: string | null };
  displayField?: string | null;
  displayTemplate?: string | null;
  formLayout?: FormLayout | null;
  primaryKey: PrimaryKey;
  timestamps: Timestamps;
  state?: CollectionState | null;
}

interface SettingsRow {
  source_kind?: "table" | "materialized-view";
  source_schema_hash?: string | null;
  id: string;
  name: string;
  display_name?: string | null;
  translations?: import("@asmblyr-collaborative/contracts").LabelTranslations;
  hidden?: boolean;
  mcp_enabled?: boolean;
  mcp_description?: string | null;
  display_field?: string | null;
  display_template?: string | null;
  form_layout?: FormLayout | null;
  mode: CollectionMode;
  primary_key_name: string;
  primary_key_type: PrimaryKeyType;
  created_at_enabled: boolean;
  updated_at_enabled: boolean;
  state?: CollectionState | null;
}

export function settingsFromRow(
  row: Omit<SettingsRow, "name" | "id">,
): CollectionSettings {
  return {
    ...(row.source_kind === "materialized-view"
      ? { sourceKind: row.source_kind }
      : {}),
    mode: row.mode,
    displayName: row.display_name ?? null,
    translations: row.translations ?? {},
    hidden: row.hidden ?? false,
    mcp: {
      enabled: row.mcp_enabled ?? true,
      description: row.mcp_description ?? null,
    },
    displayField: row.display_field ?? null,
    displayTemplate: row.display_template ?? null,
    formLayout: row.form_layout ?? null,
    primaryKey: { name: row.primary_key_name, type: row.primary_key_type },
    timestamps: {
      createdAt: row.created_at_enabled,
      updatedAt: row.updated_at_enabled,
    },
    state: row.state ?? null,
  };
}

export async function findCollectionSettings(
  database: Knex,
  name: string,
): Promise<
  | (CollectionSettings & {
      internalId: string;
      sourceSchemaHash?: string | null;
    })
  | null
> {
  const row = await database<SettingsRow>("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .first(
      "source_kind",
      "source_schema_hash",
      "id",
      "mode",
      "display_name",
      "translations",
      "hidden",
      "mcp_enabled",
      "mcp_description",
      "display_field",
      "display_template",
      "form_layout",
      "primary_key_name",
      "primary_key_type",
      "created_at_enabled",
      "updated_at_enabled",
      "state",
    );
  return row
    ? {
        ...settingsFromRow(row),
        internalId: row.id,
        sourceSchemaHash: row.source_schema_hash,
      }
    : null;
}

export function isManagedColumn(
  settings: CollectionSettings,
  name: string,
): boolean {
  return (
    name === settings.primaryKey.name ||
    name === settings.state?.field ||
    (name === "created_at" && settings.timestamps.createdAt) ||
    (name === "updated_at" && settings.timestamps.updatedAt)
  );
}

export async function lockedCollectionSettings(
  transaction: Knex.Transaction,
  name: string,
  mode: "ACCESS SHARE" | "ACCESS EXCLUSIVE" = "ACCESS EXCLUSIVE",
  allowReadOnlyMetadata = false,
): Promise<CollectionSettings & { internalId: string }> {
  const current = await findCollectionSettings(transaction, name);
  if (!current) throw new CollectionNotFoundError(name);
  if (!allowReadOnlyMetadata) {
    assertCollectionWritable(current);
  }
  if (current.sourceKind === "materialized-view") {
    return current;
  }
  try {
    await transaction.raw(`LOCK TABLE ?? IN ${mode} MODE`, [`public.${name}`]);
  } catch (error) {
    if (postgresCode(error) === "42P01")
      throw new CollectionNotFoundError(name);
    throw error;
  }
  // Enabling a managed field can have committed while this request waited.
  const settings = await findCollectionSettings(transaction, name);
  if (!settings) throw new CollectionNotFoundError(name);
  return settings;
}
