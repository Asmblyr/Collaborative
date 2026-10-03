import { createHash } from "node:crypto";
import type { Knex } from "knex";
import type { CreateRelationInput } from "./relation-input.js";
import { lockCollectionOrder, nextSortOrder } from "./ordering.js";
import { createForeignKey } from "./relations.js";
import { findCollectionSettings } from "./settings-repository.js";
import {
  CollectionConflictError,
  CollectionFieldConflictError,
  CollectionInputError,
  CollectionNotFoundError,
} from "./validation.js";

interface AliasInput {
  collection: string;
  name: string;
  kind: "o2m" | "m2m";
  related: string;
  through: string;
  throughField: string;
  relatedField?: string;
}

export async function createAlias(
  transaction: Knex.Transaction,
  input: AliasInput,
): Promise<void> {
  if (!(await findCollectionSettings(transaction, input.collection))) {
    throw new CollectionNotFoundError(input.collection);
  }
  await transaction.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [
    `public.${input.collection}`,
  ]);
  if (
    (await transaction.schema
      .withSchema("public")
      .hasColumn(input.collection, input.name)) ||
    (await transaction("asmblyr_relation_aliases")
      .withSchema("public")
      .where({ collection_name: input.collection, field_name: input.name })
      .first("field_name"))
  ) {
    throw new CollectionFieldConflictError(
      `Field already exists: ${input.name}`,
    );
  }
  await transaction("asmblyr_relation_aliases")
    .withSchema("public")
    .insert({
      collection_name: input.collection,
      field_name: input.name,
      kind: input.kind,
      related_collection: input.related,
      through_collection: input.through,
      through_field: input.throughField,
      related_field: input.relatedField ?? null,
    });
}

export async function createOneToMany(
  transaction: Knex.Transaction,
  parent: string,
  input: Extract<CreateRelationInput, { kind: "o2m" }>,
): Promise<void> {
  if (!(await findCollectionSettings(transaction, parent)))
    throw new CollectionNotFoundError(parent);
  if (input.reuseExisting) {
    const relation = await transaction("asmblyr_relations")
      .withSchema("public")
      .where({
        source_collection: input.targetCollection,
        source_field: input.foreignKey,
        target_collection: parent,
      })
      .first("source_field");
    if (!relation)
      throw new CollectionInputError(
        "Existing foreign key does not point to this collection",
      );
  } else {
    await createForeignKey(transaction, input.targetCollection, {
      name: input.foreignKey,
      targetCollection: parent,
      required: input.required,
      nullable: input.nullable,
      onDelete: input.onDelete,
      defaultValue: input.defaultValue,
    });
  }
  await createAlias(transaction, {
    collection: parent,
    name: input.name,
    kind: "o2m",
    related: input.targetCollection,
    through: input.targetCollection,
    throughField: input.foreignKey,
  });
}

export async function createManyToMany(
  transaction: Knex.Transaction,
  source: string,
  input: Extract<CreateRelationInput, { kind: "m2m" }>,
): Promise<void> {
  await lockCollectionOrder(transaction);
  if (!(await findCollectionSettings(transaction, source)))
    throw new CollectionNotFoundError(source);
  if (!(await findCollectionSettings(transaction, input.targetCollection))) {
    throw new CollectionNotFoundError(input.targetCollection);
  }
  if (
    input.junctionCollection === source ||
    input.junctionCollection === input.targetCollection
  ) {
    throw new CollectionInputError(
      "Junction collection must have its own name",
    );
  }
  if (
    input.sourceKey === input.targetKey ||
    input.sourceKey === "id" ||
    input.targetKey === "id"
  ) {
    throw new CollectionInputError(
      "Junction keys must be distinct and cannot be id",
    );
  }
  if (source === input.targetCollection && input.reverseField === input.name) {
    throw new CollectionInputError(
      "Self relation needs different field names on each side",
    );
  }
  if (
    (await findCollectionSettings(transaction, input.junctionCollection)) ||
    (await transaction.schema
      .withSchema("public")
      .hasTable(input.junctionCollection))
  ) {
    throw new CollectionConflictError(input.junctionCollection);
  }

  await transaction.schema
    .withSchema("public")
    .createTable(input.junctionCollection, (table) => {
      table.bigIncrements("id").primary();
    });
  const sortOrder = await nextSortOrder(transaction, null);
  await transaction("asmblyr_collections").withSchema("public").insert({
    name: input.junctionCollection,
    folder_id: null,
    sort_order: sortOrder,
    mode: "multiple",
    primary_key_name: "id",
    primary_key_type: "bigserial",
    created_at_enabled: false,
    updated_at_enabled: false,
  });
  await createForeignKey(transaction, input.junctionCollection, {
    name: input.sourceKey,
    targetCollection: source,
    required: true,
    nullable: false,
    onDelete: input.sourceOnDelete,
  });
  await createForeignKey(transaction, input.junctionCollection, {
    name: input.targetKey,
    targetCollection: input.targetCollection,
    required: true,
    nullable: false,
    onDelete: input.targetOnDelete,
  });
  if (!input.allowDuplicates) {
    const digest = createHash("sha256")
      .update(input.junctionCollection)
      .digest("hex")
      .slice(0, 20);
    await transaction.raw("CREATE UNIQUE INDEX ?? ON ?? (??, ??)", [
      `asmblyr_junction_pair_${digest}`,
      `public.${input.junctionCollection}`,
      input.sourceKey,
      input.targetKey,
    ]);
  }
  await createAlias(transaction, {
    collection: source,
    name: input.name,
    kind: "m2m",
    related: input.targetCollection,
    through: input.junctionCollection,
    throughField: input.sourceKey,
    relatedField: input.targetKey,
  });
  if (input.reverseField) {
    await createAlias(transaction, {
      collection: input.targetCollection,
      name: input.reverseField,
      kind: "m2m",
      related: source,
      through: input.junctionCollection,
      throughField: input.targetKey,
      relatedField: input.sourceKey,
    });
  }
}
