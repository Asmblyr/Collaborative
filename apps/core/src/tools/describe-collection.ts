import type { Collection } from "../collections/types.js";
import { resolveFilterField } from "../items/filter-fields.js";
import { grantFor, type Access } from "../permissions/access.js";
import type { CollectionData } from "./collection-data.js";
import { aggregateOperationsFor } from "./aggregate-fields.js";

function fieldNames(collection: Collection): string[] {
  return [
    collection.primaryKey.name,
    ...(collection.timestamps.createdAt ? ["created_at"] : []),
    ...(collection.timestamps.updatedAt ? ["updated_at"] : []),
    ...collection.fields.map((field) => field.name),
  ];
}

export function describeCollection(name: string, data: CollectionData, access: Access) {
  const source = data.catalog.find((collection) => collection.name === name)!;
  const paths: object[] = [];
  let omitted = false;

  function addPath(path: string): void {
    try {
      const field = resolveFilterField(path, name, data.schema, data.allowed, data.catalog, access);
      if (paths.length >= 200) {
        omitted = true;
        return;
      }
      paths.push({
        path,
        type: field.type,
        nullable: field.nullable,
        ...(!path.includes(".")
          ? { aggregation: { groupable: true, operations: aggregateOperationsFor(field.type) } }
          : {}),
        ...(field.keyType ? { keyType: field.keyType } : {}),
        ...(field.relation ? { relation: field.relation.kind } : {}),
        ...(path.includes(".")
          ? {}
          : source.state?.field === path
            ? { states: source.state.statuses }
            : {}),
      });
    } catch {
      // Unreadable or unsupported paths must not reach any tool consumer.
    }
  }

  fieldNames(source).forEach(addPath);
  for (const field of source.fields) {
    const target = data.catalog.find(
      (collection) => collection.name === field.relation?.collection,
    );
    if (target) {
      fieldNames(target).forEach((targetField) => addPath(`${field.name}.${targetField}`));
    }
  }

  const canRead = (field: string) => data.allowed.includes("*") || data.allowed.includes(field);
  const readable = source.fields.filter((field) => canRead(field.name));
  return {
    collection: name,
    displayName: source.displayName ?? name,
    description: source.mcp?.description ?? null,
    primaryKey: source.primaryKey,
    ...(source.state && canRead(source.state.field) ? { state: source.state } : {}),
    fields: readable.slice(0, 100).map((field) => {
      const relation = field.relation;
      const readableTarget = relation && grantFor(access, relation.collection, "read");
      const reference =
        relation?.kind === "m2o" && readableTarget
          ? {
              kind: relation.kind,
              collection: relation.collection,
              displayName:
                data.catalog.find((entry) => entry.name === relation.collection)?.displayName ||
                relation.collection,
              primaryKey: relation.primaryKey,
            }
          : undefined;
      return {
        name: field.name,
        type: field.type,
        nullable: field.nullable,
        required: field.required,
        ...(field.presentation?.label ? { label: field.presentation.label } : {}),
        ...(field.presentation?.options ? { options: field.presentation.options } : {}),
        readableValue: data.schema.fields.has(field.name),
        ...(reference ? { relation: reference } : {}),
      };
    }),
    filterPaths: paths,
    timestamps: fieldNames(source).filter(
      (field) => (field === "created_at" || field === "updated_at") && canRead(field),
    ),
    partial: omitted || readable.length > 100,
  };
}
