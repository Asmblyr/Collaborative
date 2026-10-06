import type { Knex } from "knex";
import type { MaterializedViewCandidate } from "@asmblyr-collaborative/contracts";
import type { Collection } from "./types.js";
import { objectInput } from "../shared/input.js";
import {
  materializedSources,
  materializedProblem,
} from "./materialized-repository.js";
import {
  lockCollectionOrder,
  nextSortOrder,
  promoteCollectionChildren,
} from "./ordering.js";
import {
  parseCollectionLocation,
  validateCollectionLocation,
} from "./navigation.js";
import { parseDisplayName } from "./metadata-validation.js";
import {
  parseMutableCollectionName,
  parseFolderId,
  CollectionConflictError,
  CollectionInputError,
  CollectionNotFoundError,
  CollectionDependencyError,
} from "./validation.js";
import { listCollections } from "./catalog-repository.js";
import { updateFieldPresentation } from "./field-presentation.js";
import { updateCollectionDisplay } from "./display.js";

export async function listMaterializedViews(
  database: Knex,
): Promise<MaterializedViewCandidate[]> {
  const registered = new Set(
    await database("asmblyr_collections")
      .withSchema("public")
      .pluck<string[]>("name"),
  );
  const sources = await materializedSources(database);
  return sources
    .filter((source) => !/^(asmblyr_|plugin_)/i.test(source.name))
    .map((source) => ({
      name: source.name,
      populated: source.populated,
      connected: registered.has(source.name),
      problem: materializedProblem(source),
      keys: source.keys,
      fields: source.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
      })),
    }));
}

export async function connectMaterializedView(
  database: Knex,
  body: unknown,
): Promise<Collection> {
  const input = objectInput(body, [
    "name",
    "primaryKey",
    "displayName",
    "folderId",
    "workspaceId",
    "displayField",
    "displayTemplate",
    "presentations",
  ]);
  const name = parseMutableCollectionName(input.name);
  const location = parseCollectionLocation({ folderId: input.folderId });
  const workspaceId = parseFolderId(input.workspaceId);
  const displayName = parseDisplayName(input.displayName);
  if (typeof input.primaryKey !== "string") {
    throw new CollectionInputError("Choose a unique row key");
  }
  return database.transaction(async (transaction) => {
    await lockCollectionOrder(transaction);
    await transaction.raw("SET LOCAL statement_timeout = '5s'");
    if (
      await transaction("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .first("id")
    ) {
      throw new CollectionConflictError(name);
    }
    const [source] = await materializedSources(transaction, name);
    if (!source) {
      throw new CollectionNotFoundError(name);
    }
    const problem = materializedProblem(source);
    if (problem) {
      throw new CollectionInputError(
        `Materialized view cannot be connected: ${problem}`,
      );
    }
    const key = source.keys.find(
      (candidate) => candidate.name === input.primaryKey,
    );
    if (!key) {
      throw new CollectionInputError(
        "Choose a supported column with a full unique index",
      );
    }
    // SELECT also holds the source's AccessShare lock until registration commits.
    const invalid = transaction(name).withSchema("public").whereNull(key.name);
    if (key.type === "serial" || key.type === "bigserial") {
      invalid.orWhere(key.name, "<=", 0);
    }
    if (key.type === "text") {
      invalid.orWhereRaw("length(??) > 255 OR btrim(??) = ''", [
        key.name,
        key.name,
      ]);
    }
    if (await invalid.first(key.name)) {
      throw new CollectionInputError(
        "Row key contains NULL or unsupported identifiers",
      );
    }
    await validateCollectionLocation(transaction, name, location);
    if (
      workspaceId &&
      !(await transaction("asmblyr_workspaces")
        .withSchema("public")
        .where({ id: workspaceId })
        .forShare()
        .first("id"))
    ) {
      throw new CollectionInputError("Workspace not found");
    }
    const [registered] = await transaction("asmblyr_collections")
      .withSchema("public")
      .insert({
        name,
        display_name: displayName,
        folder_id: location.folderId,
        sort_order: await nextSortOrder(transaction, location.folderId),
        mode: "multiple",
        primary_key_name: key.name,
        primary_key_type: key.type,
        created_at_enabled: false,
        updated_at_enabled: false,
        source_kind: "materialized-view",
        source_schema_hash: source.hash,
      })
      .returning<{ id: string }[]>("id");
    if (workspaceId) {
      await transaction("asmblyr_workspace_collections")
        .withSchema("public")
        .insert({ workspace_id: workspaceId, collection_id: registered.id });
    }
    if (input.presentations !== undefined) {
      if (
        !input.presentations ||
        typeof input.presentations !== "object" ||
        Array.isArray(input.presentations)
      ) {
        throw new CollectionInputError("Expected field presentations");
      }
      for (const [field, presentation] of Object.entries(input.presentations)) {
        if (
          field === key.name ||
          !source.columns.some((column) => column.name === field)
        ) {
          throw new CollectionInputError("Unknown presentation field");
        }
        await updateFieldPresentation(transaction, name, field, presentation);
      }
    }
    if (
      input.displayField !== undefined ||
      input.displayTemplate !== undefined
    ) {
      await updateCollectionDisplay(transaction, name, {
        displayField: input.displayField ?? null,
        displayTemplate: input.displayTemplate ?? null,
      });
    }
    return (await listCollections(transaction)).find(
      (collection) => collection.name === name,
    )!;
  });
}

export async function disconnectMaterializedView(
  database: Knex,
  input: unknown,
  onDeleted?: (
    transaction: Knex.Transaction,
    target: { collection: string; collectionId: string },
  ) => Promise<void>,
): Promise<void> {
  const name = parseMutableCollectionName(input);
  await database.transaction(async (transaction) => {
    await lockCollectionOrder(transaction);
    const row = await transaction("asmblyr_collections")
      .withSchema("public")
      .where({ name, source_kind: "materialized-view" })
      .forUpdate()
      .first("id");
    if (!row) {
      throw new CollectionNotFoundError(name);
    }
    const dependencies = await transaction("asmblyr_relations")
      .withSchema("public")
      .where({ target_collection: name })
      .orWhere({ source_collection: name })
      .first("source_field");
    const aliases = await transaction("asmblyr_relation_aliases")
      .withSchema("public")
      .where({ related_collection: name })
      .orWhere({ through_collection: name })
      .orWhere({ collection_name: name })
      .first("field_name");
    if (dependencies || aliases) {
      throw new CollectionDependencyError();
    }
    await promoteCollectionChildren(transaction, name);
    await transaction("asmblyr_collections")
      .withSchema("public")
      .where({ id: row.id })
      .delete();
    await onDeleted?.(transaction, { collection: name, collectionId: row.id });
  });
}
