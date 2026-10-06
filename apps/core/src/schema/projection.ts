import { createHash } from "node:crypto";
import type {
  SchemaSnapshot,
  SchemaField,
  SchemaValueType,
  SchemaPluginMethod,
} from "@asmblyr-collaborative/contracts";
import type { Collection } from "../collections/types.js";
import { grantFor, type Access } from "../permissions/access.js";

function scalar(type: string): SchemaValueType {
  if (type === "integer" || type === "serial") {
    return "number";
  }
  if (type === "boolean") {
    return "boolean";
  }
  if (type === "json") {
    return "json";
  }
  if (type === "files") {
    return "strings";
  }
  return "string";
}

function filterKind(type: string): NonNullable<SchemaField["filterKind"]> {
  if (["text", "email"].includes(type)) {
    return "text";
  }
  if (["integer", "bigint", "decimal", "date", "datetime"].includes(type)) {
    return "ordered";
  }
  if (["boolean", "uuid", "file", "relation"].includes(type)) {
    return "scalar";
  }
  return "none";
}

/** Explicit allowlist: no labels, defaults, credentials, conditions or records. */
export function projectSchema(
  catalog: readonly Collection[],
  access: Access,
  methods: readonly SchemaPluginMethod[] = [],
): SchemaSnapshot {
  const collections = catalog
    .flatMap((collection) => {
      const readonlySource = collection.sourceKind === "materialized-view";
      const grants = {
        read: grantFor(access, collection.name, "read"),
        create: readonlySource
          ? null
          : grantFor(access, collection.name, "create"),
        update: readonlySource
          ? null
          : grantFor(access, collection.name, "update"),
        delete: readonlySource
          ? null
          : grantFor(access, collection.name, "delete"),
      };
      if (!Object.values(grants).some(Boolean)) {
        return [];
      }
      const allows = (action: "read" | "create" | "update", name: string) =>
        Boolean(
          grants[action]?.includes("*") || grants[action]?.includes(name),
        );
      const key = collection.primaryKey;
      const fields: SchemaField[] = [
        {
          name: key.name,
          type: scalar(key.type),
          nullable: false,
          read: Boolean(grants.read),
          create: key.type === "text" && Boolean(grants.create),
          update: false,
          requiredOnCreate: key.type === "text" && Boolean(grants.create),
          filterKind: "scalar",
        },
      ];
      for (const field of collection.fields) {
        // Alias relations use dedicated relation operations, not scalar row properties.
        if (field.type === "alias") {
          continue;
        }
        const read = allows("read", field.name);
        const readonly = Boolean(
          field.presentation?.rules?.readonly ||
            field.presentation?.rules?.computed,
        );
        const create = allows("create", field.name) && !readonly;
        const update = allows("update", field.name) && !readonly;
        if (!read && !create && !update) {
          continue;
        }
        let type = scalar(field.type);
        if (
          field.presentation?.interface === "multiselect" ||
          field.presentation?.interface === "tags"
        ) {
          type = "strings";
        } else if (field.relation?.kind === "m2o") {
          type = scalar(field.relation.primaryKey.type);
        }
        const entry: SchemaField = {
          name: field.name,
          type,
          nullable: field.nullable && !field.required,
          read,
          create,
          update,
          requiredOnCreate:
            create &&
            field.defaultValue === undefined &&
            (field.required || !field.nullable),
        };
        if (field.relation?.kind === "m2o") {
          entry.relationKey = field.relation.primaryKey.type;
        }
        entry.filterKind =
          type === "strings"
            ? "none"
            : field.relation?.kind === "m2o"
              ? "scalar"
              : filterKind(field.type);
        // Only closed choices constrain the API; custom values remain the scalar type.
        const presentation = field.presentation;
        if (
          ["select", "multiselect"].includes(presentation?.interface ?? "") &&
          presentation?.options?.length
        ) {
          entry.enum = presentation.options.map((choice) => choice.value);
        }
        fields.push(entry);
      }
      for (const [enabled, name] of [
        [collection.timestamps.createdAt, "created_at"],
        [collection.timestamps.updatedAt, "updated_at"],
      ] as const) {
        if (enabled && allows("read", name)) {
          fields.push({
            name,
            type: "string",
            nullable: false,
            read: true,
            create: false,
            update: false,
            requiredOnCreate: false,
            filterKind: "ordered",
          });
        }
      }
      fields.sort((a, b) => a.name.localeCompare(b.name, "en"));
      return [
        {
          name: collection.name,
          ...(readonlySource
            ? { sourceKind: "materialized-view" as const }
            : {}),
          mode: collection.mode,
          primaryKey: { name: key.name, type: key.type },
          actions: {
            read: Boolean(grants.read),
            create: Boolean(grants.create),
            update: Boolean(grants.update),
            delete: Boolean(grants.delete),
          },
          fields,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const body = {
    version: 1 as const,
    collections,
    ...(methods.length ? { methods } : {}),
  };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, hash };
}
