import type {
  SchemaSnapshot,
  SchemaField,
  SchemaCollection,
} from "@asmblyr-collaborative/contracts";
import { parsePluginMethods } from "./plugin-validation.js";

const identifier = /^[a-z][a-z0-9_]{0,62}$/;
function object(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  ) {
    throw new TypeError("Invalid schema snapshot object");
  }
  return input as Record<string, unknown>;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError("Invalid schema flag");
  }
  return value;
}
function name(value: unknown): string {
  if (typeof value !== "string" || !identifier.test(value)) {
    throw new TypeError("Invalid schema identifier");
  }
  return value;
}
function fields(input: unknown): SchemaField[] {
  if (!Array.isArray(input) || input.length > 1600) {
    throw new TypeError("Invalid schema fields");
  }
  const seen = new Set<string>();
  return input.map((raw) => {
    const f = object(raw, [
      "name",
      "type",
      "nullable",
      "read",
      "create",
      "update",
      "requiredOnCreate",
      "enum",
      "relationKey",
      "filterKind",
    ]);
    const fieldName = name(f.name);
    if (
      seen.has(fieldName) ||
      !["string", "number", "boolean", "json", "strings"].includes(
        String(f.type),
      )
    ) {
      throw new TypeError("Invalid or duplicate schema field");
    }
    seen.add(fieldName);
    const field: SchemaField = {
      name: fieldName,
      type: f.type as SchemaField["type"],
      nullable: bool(f.nullable),
      read: bool(f.read),
      create: bool(f.create),
      update: bool(f.update),
      requiredOnCreate: bool(f.requiredOnCreate),
    };
    if (field.requiredOnCreate && !field.create) {
      throw new TypeError("Required field must be writable on create");
    }
    if (f.relationKey !== undefined) {
      if (
        !["uuid", "serial", "bigserial", "text"].includes(String(f.relationKey))
      ) {
        throw new TypeError("Invalid relation key type");
      }
      field.relationKey = f.relationKey as SchemaField["relationKey"];
    }
    if (f.filterKind !== undefined) {
      if (
        !["text", "ordered", "scalar", "none"].includes(String(f.filterKind))
      ) {
        throw new TypeError("Invalid schema filter kind");
      }
      field.filterKind = f.filterKind as SchemaField["filterKind"];
    }
    if (f.enum !== undefined) {
      const elementType = field.type === "strings" ? "string" : field.type;
      if (
        !Array.isArray(f.enum) ||
        !f.enum.length ||
        f.enum.length > 1000 ||
        !["number", "string"].includes(elementType) ||
        f.enum.some(
          (value) =>
            typeof value !== elementType ||
            (typeof value === "number" && !Number.isFinite(value)) ||
            (typeof value === "string" && value.length > 4000),
        )
      ) {
        throw new TypeError("Invalid schema enum");
      }
      field.enum = [...new Set(f.enum)] as (string | number)[];
    }
    return field;
  });
}
/** Rebuild an allowlisted object before using remote JSON as generated source. */
export function parseSchemaSnapshot(input: unknown): SchemaSnapshot {
  const raw = object(input, ["version", "hash", "collections", "methods"]);
  if (
    raw.version !== 1 ||
    typeof raw.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.hash) ||
    !Array.isArray(raw.collections) ||
    raw.collections.length > 10000
  ) {
    throw new TypeError("Unsupported schema snapshot");
  }
  const seen = new Set<string>();
  const collections: SchemaCollection[] = raw.collections.map((input) => {
    const c = object(input, [
      "name",
      "mode",
      "sourceKind",
      "primaryKey",
      "actions",
      "fields",
    ]);
    const collectionName = name(c.name);
    if (
      seen.has(collectionName) ||
      !["single", "multiple"].includes(String(c.mode))
    ) {
      throw new TypeError("Invalid or duplicate schema collection");
    }
    if (
      c.sourceKind !== undefined &&
      !["table", "materialized-view"].includes(String(c.sourceKind))
    ) {
      throw new TypeError("Invalid schema source kind");
    }
    seen.add(collectionName);
    const pk = object(c.primaryKey, ["name", "type"]);
    if (!["uuid", "serial", "bigserial", "text"].includes(String(pk.type))) {
      throw new TypeError("Invalid schema primary key");
    }
    const actions = object(c.actions, ["read", "create", "update", "delete"]);
    const parsedFields = fields(c.fields);
    if (
      c.sourceKind === "materialized-view" &&
      (actions.create !== false ||
        actions.update !== false ||
        actions.delete !== false ||
        parsedFields.some((field) => field.create || field.update))
    ) {
      throw new TypeError("Materialized collection must be read only");
    }
    if (!parsedFields.some((field) => field.name === pk.name)) {
      throw new TypeError("Schema primary key is missing");
    }
    return {
      name: collectionName,
      ...(c.sourceKind === undefined
        ? {}
        : { sourceKind: c.sourceKind as SchemaCollection["sourceKind"] }),
      mode: c.mode as SchemaCollection["mode"],
      primaryKey: {
        name: name(pk.name),
        type: pk.type as SchemaCollection["primaryKey"]["type"],
      },
      actions: {
        read: bool(actions.read),
        create: bool(actions.create),
        update: bool(actions.update),
        delete: bool(actions.delete),
      },
      fields: parsedFields,
    };
  });
  return {
    version: 1,
    hash: raw.hash,
    collections,
    ...(raw.methods === undefined
      ? {}
      : { methods: parsePluginMethods(raw.methods) }),
  };
}
