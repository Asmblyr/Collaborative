import { createHash } from "node:crypto";
import type { Knex } from "knex";
import type { SystemCollectionRelation } from "@asmblyr-collaborative/contracts";
import type {
  CollectionField,
  FieldType,
  PrimaryKeyType,
} from "../collections/types.js";
import { lockedCollectionSettings } from "../collections/settings-repository.js";
import {
  CollectionInputError,
  parseField,
  parseMutableCollectionName,
} from "../collections/validation.js";
import { objectInput } from "../shared/input.js";

export type CustomFieldDefinition = CollectionField & {
  relation?: SystemCollectionRelation;
};

const storageTypes: Record<PrimaryKeyType, FieldType> = {
  uuid: "uuid",
  serial: "integer",
  bigserial: "bigint",
  text: "text",
};

export async function parseSystemRelation(
  db: Knex.Transaction,
  value: unknown,
): Promise<CustomFieldDefinition> {
  const input = objectInput(value, [
    "name",
    "type",
    "targetCollection",
    "required",
    "nullable",
  ]);
  const target = parseMutableCollectionName(input.targetCollection);
  const settings = await lockedCollectionSettings(db, target, "ACCESS SHARE");
  if (settings.mode !== "multiple") {
    throw new CollectionInputError(
      "Relation target must be a regular collection of records",
    );
  }
  const definition = parseField({
    name: input.name,
    type: storageTypes[settings.primaryKey.type],
    required: input.required,
    nullable: input.nullable,
  });
  return {
    ...definition,
    relation: {
      kind: "m2o",
      collection: target,
      primaryKey: settings.primaryKey,
      onDelete: "setNull",
    },
  };
}

export async function addSystemRelationConstraint(
  db: Knex.Transaction,
  table: string,
  definition: CustomFieldDefinition,
) {
  const relation = definition.relation;
  if (!relation) {
    return;
  }
  const digest = createHash("sha256")
    .update(`${table}.${definition.name}`)
    .digest("hex")
    .slice(0, 20);
  await db.raw(
    "ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (??) ON DELETE SET NULL",
    [
      `public.${table}`,
      `asmblyr_system_fk_${digest}`,
      definition.name,
      `public.${relation.collection}`,
      relation.primaryKey.name,
    ],
  );
  await db.raw("CREATE INDEX ?? ON ?? (??)", [
    `asmblyr_system_idx_${digest}`,
    `public.${table}`,
    definition.name,
  ]);
}
