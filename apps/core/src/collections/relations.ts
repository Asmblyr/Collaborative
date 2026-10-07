import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { assertCollectionWritable } from "./source-access.js";
import { parseItemId } from "../items/validation.js";
import { listCollections } from "./catalog-repository.js";
import {
  createAlias,
  createManyToMany,
  createOneToMany,
} from "./relation-aliases.js";
import { assertNoAlias } from "./field-name.js";
import { parseCreateRelation, type DeleteAction } from "./relation-input.js";
import {
  findCollectionSettings,
  isManagedColumn,
} from "./settings-repository.js";
import {
  CollectionFieldConflictError,
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
} from "./validation.js";

export interface ForeignKeyInput {
  name: string;
  targetCollection: string;
  required: boolean;
  nullable: boolean;
  onDelete: DeleteAction;
  defaultValue?: string | number;
}

const deleteSql: Record<DeleteAction, string> = {
  restrict: "RESTRICT",
  setNull: "SET NULL",
  setDefault: "SET DEFAULT",
  cascade: "CASCADE",
};

export async function createForeignKey(
  transaction: Knex.Transaction,
  source: string,
  input: ForeignKeyInput,
): Promise<void> {
  const sourceSettings = await findCollectionSettings(transaction, source);
  if (!sourceSettings) throw new CollectionNotFoundError(source);
  const systemUser = input.targetCollection === "@users";
  const targetSettings = systemUser
    ? {
        sourceKind: "table" as const,
        primaryKey: { name: "id", type: "uuid" as const },
      }
    : await findCollectionSettings(transaction, input.targetCollection);
  if (!targetSettings)
    throw new CollectionNotFoundError(input.targetCollection);
  assertCollectionWritable(sourceSettings);
  if (!systemUser) assertCollectionWritable(targetSettings);
  if (isManagedColumn(sourceSettings, input.name)) {
    throw new CollectionFieldConflictError(
      `Field name is managed: ${input.name}`,
    );
  }
  await assertNoAlias(transaction, source, input.name);
  if (input.onDelete === "setDefault") {
    const value = parseItemId(
      String(input.defaultValue),
      targetSettings.primaryKey.type,
    );
    const exists = await transaction(input.targetCollection)
      .withSchema("public")
      .where(targetSettings.primaryKey.name, value)
      .first(targetSettings.primaryKey.name);
    if (!exists)
      throw new CollectionInputError("Default target item does not exist");
  }
  const digest = createHash("sha256")
    .update(`${source}.${input.name}`)
    .digest("hex")
    .slice(0, 20);
  await transaction.schema.withSchema("public").alterTable(source, (table) => {
    let column: Knex.ColumnBuilder;
    switch (targetSettings.primaryKey.type) {
      case "uuid":
        column = table.uuid(input.name);
        break;
      case "serial":
        column = table.integer(input.name);
        break;
      case "bigserial":
        column = table.bigInteger(input.name);
        break;
      case "text":
        column = table.string(input.name, 255);
        break;
    }
    if (input.defaultValue !== undefined) column.defaultTo(input.defaultValue);
    if (!input.nullable) column.notNullable();
  });
  await transaction.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (??) ON DELETE ${deleteSql[input.onDelete]}`,
    [
      `public.${source}`,
      `asmblyr_relation_fk_${digest}`,
      input.name,
      systemUser ? "public.asmblyr_users" : `public.${input.targetCollection}`,
      targetSettings.primaryKey.name,
    ],
  );
  await transaction.raw("CREATE INDEX ?? ON ?? (??)", [
    `asmblyr_relation_idx_${digest}`,
    `public.${source}`,
    input.name,
  ]);
  await transaction("asmblyr_relations")
    .withSchema("public")
    .insert({
      source_collection: source,
      source_field: input.name,
      target_collection: systemUser ? null : input.targetCollection,
      target_system: systemUser ? "users" : null,
      on_delete: input.onDelete,
    });
  if (input.required || input.defaultValue !== undefined) {
    await transaction("asmblyr_field_metadata")
      .withSchema("public")
      .insert({
        collection_name: source,
        field_name: input.name,
        semantic_type: null,
        required: input.required,
        default_value:
          input.defaultValue === undefined
            ? null
            : JSON.stringify(input.defaultValue),
      });
  }
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function addCollectionRelation(
  database: Knex,
  sourceInput: unknown,
  body: unknown,
) {
  const source = parseMutableCollectionName(sourceInput);
  const input = parseCreateRelation(body);
  try {
    await database.transaction(async (transaction) => {
      if (input.kind === "m2m") {
        await createManyToMany(transaction, source, input);
      } else if (input.kind === "o2m") {
        await createOneToMany(transaction, source, input);
      } else {
        await createForeignKey(transaction, source, input);
        if (input.reverseField) {
          await createAlias(transaction, {
            collection: input.targetCollection,
            name: input.reverseField,
            kind: "o2m",
            related: source,
            through: source,
            throughField: input.name,
          });
        }
      }
    });
  } catch (error) {
    if (
      postgresCode(error) === "42701" ||
      postgresCode(error) === "23505" ||
      postgresCode(error) === "42P07"
    ) {
      throw new CollectionFieldConflictError(
        "Relation field or junction collection already exists",
      );
    }
    if (postgresCode(error) === "23502") {
      throw new CollectionFieldConflictError(
        "A non-nullable relation cannot be added while the collection has items",
      );
    }
    throw error;
  }
  const collection = (await listCollections(database)).find(
    (entry) => entry.name === source,
  );
  if (!collection) throw new CollectionNotFoundError(source);
  return collection;
}
