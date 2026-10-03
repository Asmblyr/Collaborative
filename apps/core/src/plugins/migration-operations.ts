import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { MigrationOperation } from "@asmblyr/kit";
import type { Knex } from "knex";
import { addFieldColumn } from "../collections/field-types.js";
import { saveFieldMetadata } from "../collections/field-metadata.js";
import { parsePluginCollection, type PluginCollection } from "./collection-definition.js";

/** Only scoped, additive operations are available in the first migration API. */
export async function applyMigrationOperation(
  transaction: Knex.Transaction,
  namespace: string,
  operation: MigrationOperation,
  current: PluginCollection,
  baseline: boolean,
): Promise<void> {
  const name = current.input.name;
  if (operation.type === "addField") {
    // Reuse declaration validation, including reserved names and managed-column collisions.
    const parsed = parsePluginCollection(
      {
        name: current.localName,
        primaryKey: current.input.primaryKey,
        timestamps: current.input.timestamps,
        fields: { [operation.name]: operation.field },
      },
      namespace,
      current.localName,
    );
    const field = parsed.input.fields[0];
    const existing = current.input.fields.find((entry) => entry.name === field.name);
    if (baseline) {
      if (
        !isDeepStrictEqual(existing, field) ||
        !isDeepStrictEqual(current.presentation[field.name], parsed.presentation[field.name])
      )
        throw new Error(`Baseline migration disagrees with declaration: ${name}.${field.name}`);
      return;
    }
    if (existing) throw new Error(`Migration field already exists: ${name}.${field.name}`);
    await transaction.schema
      .withSchema("public")
      .alterTable(name, (table) => addFieldColumn(table, field));
    await saveFieldMetadata(transaction, name, [field]);
    const presentation = parsed.presentation[field.name];
    if (presentation) {
      await transaction("asmblyr_field_metadata")
        .withSchema("public")
        .insert({
          collection_name: name,
          field_name: field.name,
          presentation: JSON.stringify(presentation),
        })
        .onConflict(["collection_name", "field_name"])
        .merge({ presentation: JSON.stringify(presentation) });
      current.presentation[field.name] = presentation;
    }
    current.input.fields.push(field);
    return;
  }
  const fields = new Set([
    current.input.primaryKey.name,
    ...current.input.fields.map((field) => field.name),
    ...(current.input.timestamps.createdAt ? ["created_at"] : []),
    ...(current.input.timestamps.updatedAt ? ["updated_at"] : []),
  ]);
  if (operation.fields.some((field) => !fields.has(field)))
    throw new Error(`Migration index references an unknown field in ${name}`);
  const suffix = createHash("sha256")
    .update(`${name}:${operation.name}`)
    .digest("hex")
    .slice(0, 24);
  await transaction.schema.withSchema("public").alterTable(name, (table) => {
    table.index([...operation.fields], `plugin_idx_${suffix}`);
  });
}
