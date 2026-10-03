import {
  AccessDeniedError,
  grantFor,
  type Access,
} from "../permissions/access.js";
import type { Collection, PrimaryKeyType } from "../collections/types.js";
import type { collectionSchema } from "./schema-repository.js";
import { ItemError } from "./validation.js";

type Schema = Awaited<ReturnType<typeof collectionSchema>>;
export type FilterFieldType =
  | "text"
  | "email"
  | "integer"
  | "decimal"
  | "boolean"
  | "datetime"
  | "key";

export interface FilterRelationPath {
  kind: "m2o" | "o2m" | "m2m";
  sourceField: string;
  sourceKey: string;
  targetCollection: string;
  targetKey: string;
  throughCollection?: string;
  throughField?: string;
  relatedField?: string;
}

export interface ResolvedFilterField {
  column: string;
  type: FilterFieldType;
  nullable: boolean;
  keyType?: PrimaryKeyType;
  relation?: FilterRelationPath;
}

function permitted(allowed: string[], field: string, key: string): boolean {
  return field === key || allowed.includes("*") || allowed.includes(field);
}

function catalogField(
  collection: Collection,
  name: string,
): ResolvedFilterField {
  if (name === collection.primaryKey.name) {
    return {
      column: name,
      type: "key",
      keyType: collection.primaryKey.type,
      nullable: false,
    };
  }
  if (
    (name === "created_at" && collection.timestamps.createdAt) ||
    (name === "updated_at" && collection.timestamps.updatedAt)
  ) {
    return { column: name, type: "datetime", nullable: false };
  }
  const field = collection.fields.find((entry) => entry.name === name);
  if (!field || field.type === "alias")
    throw new ItemError(`Unknown filter field: ${name}`, 400);
  if (field.relation?.kind === "m2o") {
    return {
      column: name,
      type: "key",
      keyType: field.relation.primaryKey.type,
      nullable: field.nullable,
    };
  }
  if (field.type === "file" || field.type === "uuid")
    return {
      column: name,
      type: "key",
      keyType: "uuid",
      nullable: field.nullable,
    };
  if (
    !["text", "email", "integer", "decimal", "boolean", "datetime"].includes(
      field.type,
    )
  ) {
    throw new ItemError(`Unsupported filter field: ${name}`, 400);
  }
  return {
    column: name,
    type: field.type as FilterFieldType,
    nullable: field.nullable,
  };
}

export function resolveFilterField(
  name: string,
  sourceName: string,
  schema: Schema,
  allowed: string[],
  catalog: Collection[],
  access?: Access,
): ResolvedFilterField {
  const parts = name.split(".");
  if (
    parts.length > 2 ||
    parts.some((part) => !/^[a-z][a-z0-9_]{0,62}$/.test(part))
  ) {
    throw new ItemError(`Invalid filter field: ${name}`, 400);
  }
  const [root, targetField] = parts;
  if (!root) throw new ItemError("Invalid filter field", 400);
  if (targetField) {
    if (!access) throw new AccessDeniedError();
    const source = catalog.find((entry) => entry.name === sourceName);
    const relationField = source?.fields.find((entry) => entry.name === root);
    const relation = relationField?.relation;
    if (!relation) throw new ItemError(`Unknown relation: ${root}`, 400);
    if (!permitted(allowed, root, schema.settings.primaryKey.name))
      throw new AccessDeniedError();
    const target = catalog.find((entry) => entry.name === relation.collection);
    if (!target)
      throw new ItemError(
        `Unknown related collection: ${relation.collection}`,
        400,
      );
    const targetAllowed = grantFor(access, target.name, "read");
    if (
      !targetAllowed ||
      !permitted(targetAllowed, targetField, target.primaryKey.name)
    ) {
      throw new AccessDeniedError();
    }
    if (
      relation.kind === "o2m" &&
      !permitted(targetAllowed, relation.throughField, target.primaryKey.name)
    ) {
      throw new AccessDeniedError();
    }
    if (
      access.rowRules?.has(`${sourceName}:read`) ||
      access.rowRules?.has(`${target.name}:read`) ||
      (relation.kind !== "m2o" &&
        access.rowRules?.has(`${relation.throughCollection}:read`))
    )
      throw new AccessDeniedError();
    const field = catalogField(target, targetField);
    return {
      ...field,
      relation: {
        kind: relation.kind,
        sourceField: root,
        sourceKey: schema.settings.primaryKey.name,
        targetCollection: target.name,
        targetKey: target.primaryKey.name,
        ...(relation.kind !== "m2o"
          ? {
              throughCollection: relation.throughCollection,
              throughField: relation.throughField,
              ...(relation.kind === "m2m"
                ? { relatedField: relation.relatedField }
                : {}),
            }
          : {}),
      },
    };
  }
  if (root === schema.settings.primaryKey.name) {
    return {
      column: root,
      type: "key",
      keyType: schema.settings.primaryKey.type,
      nullable: false,
    };
  }
  if (!permitted(allowed, root, schema.settings.primaryKey.name))
    throw new AccessDeniedError();
  if (
    (root === "created_at" && schema.settings.timestamps.createdAt) ||
    (root === "updated_at" && schema.settings.timestamps.updatedAt)
  ) {
    return { column: root, type: "datetime", nullable: false };
  }
  const field = schema.fields.get(root);
  if (!field) throw new ItemError(`Unknown filter field: ${root}`, 400);
  if (field.type === "relation" && field.relation) {
    return {
      column: root,
      type: "key",
      keyType: field.relation.primaryKeyType,
      nullable: field.nullable,
    };
  }
  if (field.type === "file" || field.type === "uuid")
    return {
      column: root,
      type: "key",
      keyType: "uuid",
      nullable: field.nullable,
    };
  if (
    !["text", "email", "integer", "decimal", "boolean", "datetime"].includes(
      field.type ?? "",
    )
  ) {
    throw new ItemError(`Unsupported filter field: ${root}`, 400);
  }
  return {
    column: root,
    type: field.type as FilterFieldType,
    nullable: field.nullable,
  };
}
