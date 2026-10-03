import type { Knex } from "knex";
import { listCollections } from "../collections/catalog-repository.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import {
  requireGrant,
  requireHuman,
  type Access,
} from "../permissions/access.js";
import { parseItemFilters } from "./filter-input.js";
import { plainFilter, storedFilterInput } from "./filter-wire.js";
import { collectionSchema } from "./schema-repository.js";
import { ItemError, parseCollectionName } from "./validation.js";

interface PresetRow {
  id: string;
  name: string;
  filter: unknown;
  created_at: Date;
  updated_at: Date;
}

const table = "asmblyr_filter_presets";

function presetError(message: string, statusCode = 400): ItemError {
  return new ItemError(message, statusCode);
}

function parsePresetId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw presetError("Invalid saved filter ID");
  }
  return value;
}

function parseInput(body: unknown): { name: string; filter: unknown } {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !("name" in body) ||
    !("filter" in body) ||
    typeof body.name !== "string"
  ) {
    throw presetError("Expected filter name and definition");
  }
  const name = body.name.trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw presetError("Filter name must be 1–60 characters");
  }
  if (
    !body.filter ||
    typeof body.filter !== "object" ||
    Array.isArray(body.filter)
  ) {
    throw presetError("Invalid saved filter");
  }
  return { name, filter: body.filter };
}

async function collectionId(database: Knex, name: string): Promise<string> {
  parseCollectionName(name);
  const settings = await findCollectionSettings(database, name);
  if (!settings) throw presetError(`Collection not found: ${name}`, 404);
  return settings.internalId;
}

async function validatedFilter(
  database: Knex,
  name: string,
  input: unknown,
  access: Access,
): Promise<object> {
  const allowed = requireGrant(access, name, "read");
  const [schema, catalog] = await Promise.all([
    collectionSchema(database, name),
    listCollections(database),
  ]);
  const filter = parseItemFilters(
    JSON.stringify(input),
    name,
    schema,
    allowed,
    catalog,
    access,
  );
  if (filter.children.length === 0)
    throw presetError("Add at least one filter condition");
  return plainFilter(filter);
}

function publicRow(row: PresetRow, filter: object | null) {
  return {
    id: row.id,
    name: row.name,
    filter,
    available: filter !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFilterPresets(
  database: Knex,
  name: string,
  access: Access,
) {
  requireHuman(access);
  const id = await collectionId(database, name);
  const allowed = requireGrant(access, name, "read");
  const rows = await database(table)
    .withSchema("public")
    .where({ user_id: access.principal.id, collection_id: id })
    .orderBy("updated_at", "desc")
    .orderBy("name")
    .select<PresetRow[]>("id", "name", "filter", "created_at", "updated_at");
  if (rows.length === 0) return [];
  const [schema, catalog] = await Promise.all([
    collectionSchema(database, name),
    listCollections(database),
  ]);
  return rows.map((row) => {
    try {
      const filter = parseItemFilters(
        JSON.stringify(storedFilterInput(row.filter)),
        name,
        schema,
        allowed,
        catalog,
        access,
      );
      if (filter.children.length === 0) throw presetError("Empty filter");
      return publicRow(row, plainFilter(filter));
    } catch {
      return publicRow(row, null);
    }
  });
}

function rethrowConflict(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw presetError("A saved filter with this name already exists", 409);
  }
  throw error;
}

export async function createFilterPreset(
  database: Knex,
  name: string,
  body: unknown,
  access: Access,
) {
  const input = parseInput(body);
  requireHuman(access);
  const id = await collectionId(database, name);
  const filter = await validatedFilter(database, name, input.filter, access);
  try {
    return await database.transaction(async (transaction) => {
      // Serialise saves by the same user so the per-user limit holds under concurrent requests.
      await transaction("asmblyr_users")
        .withSchema("public")
        .where({ id: access.principal.id })
        .forUpdate()
        .first("id");
      const [{ total }] = await transaction(table)
        .withSchema("public")
        .where({ user_id: access.principal.id, collection_id: id })
        .count<{ total: string }[]>("* as total");
      if (Number(total) >= 30)
        throw presetError("You can save up to 30 filters per collection", 409);
      const [row] = await transaction(table)
        .withSchema("public")
        .insert({
          user_id: access.principal.id,
          collection_id: id,
          name: input.name,
          filter: JSON.stringify(filter),
        })
        .returning<PresetRow[]>([
          "id",
          "name",
          "filter",
          "created_at",
          "updated_at",
        ]);
      return publicRow(row, filter);
    });
  } catch (error) {
    return rethrowConflict(error);
  }
}

export async function updateFilterPreset(
  database: Knex,
  name: string,
  presetId: unknown,
  body: unknown,
  access: Access,
) {
  const input = parseInput(body);
  requireHuman(access);
  const id = await collectionId(database, name);
  const filter = await validatedFilter(database, name, input.filter, access);
  try {
    const [row] = await database(table)
      .withSchema("public")
      .where({
        id: parsePresetId(presetId),
        user_id: access.principal.id,
        collection_id: id,
      })
      .update({
        name: input.name,
        filter: JSON.stringify(filter),
        updated_at: database.fn.now(),
      })
      .returning<PresetRow[]>([
        "id",
        "name",
        "filter",
        "created_at",
        "updated_at",
      ]);
    if (!row) throw presetError("Saved filter not found", 404);
    return publicRow(row, filter);
  } catch (error) {
    return rethrowConflict(error);
  }
}

export async function deleteFilterPreset(
  database: Knex,
  name: string,
  presetId: unknown,
  access: Access,
): Promise<void> {
  requireHuman(access);
  const id = await collectionId(database, name);
  const deleted = await database(table)
    .withSchema("public")
    .where({
      id: parsePresetId(presetId),
      user_id: access.principal.id,
      collection_id: id,
    })
    .delete();
  if (!deleted) throw presetError("Saved filter not found", 404);
}
