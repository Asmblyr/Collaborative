import { createHash } from "node:crypto";
import type { Knex } from "knex";
import type {
  ProfileDisplaySource,
  ProfileDisplayValueType,
} from "@asmblyr-collaborative/contracts";
import { listCollections } from "../collections/catalog-repository.js";
import type { Collection } from "../collections/types.js";
import { customFields } from "../system-collections/repository.js";
import { InputError } from "../shared/input.js";

type Field = Collection["fields"][number];
interface SourceTable {
  name: string;
  key: string;
  fields: Field[];
}
export interface ProfileDisplayStep {
  table: string;
  key: string;
  field: string;
}
export interface ProfileDisplayBinding {
  steps: ProfileDisplayStep[];
  type: ProfileDisplayValueType;
  signature: string;
}

const scalarTypes = new Set([
  "text",
  "email",
  "integer",
  "bigint",
  "decimal",
  "boolean",
  "date",
  "datetime",
]);

function sourceType(field: Field): ProfileDisplaySource["type"] | null {
  if (field.presentation?.sensitive) {
    return null;
  }
  if (field.relation?.kind === "m2o") {
    return field.relation.collection === "@users" ? "user" : "relation";
  }
  if (field.type === "json" && field.presentation?.interface === "tags") {
    return "tags";
  }
  return scalarTypes.has(field.type)
    ? (field.type as ProfileDisplayValueType)
    : null;
}

export function parseDisplayPath(value: unknown, allowEmpty = false): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    (!allowEmpty && !value.length) ||
    value.some(
      (part) =>
        typeof part !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(part),
    )
  ) {
    throw new InputError("Invalid profile display path");
  }
  return value;
}

/** Never traverses Core tables except custom user columns and terminal user names. */
export async function profileDisplaySchema(db: Knex) {
  const catalog = await listCollections(db);
  const custom = await customFields(db, "users");
  const columns = await db.raw<{
    rows: { table_name: string; column_name: string; identity: string }[];
  }>(`
      SELECT c.relname AS table_name, a.attname AS column_name,
        c.oid::text || ':' || a.attnum::text || ':' || a.atttypid::text AS identity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
        AND (c.relname = 'asmblyr_users' OR c.relname IN
          (SELECT name FROM public.asmblyr_collections))
    `);
  const identities = new Map(
    columns.rows.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column.identity,
    ]),
  );
  const root: SourceTable = {
    name: "asmblyr_users",
    key: "id",
    fields: custom.map((field) => ({
      ...field.definition,
      presentation: field.presentation,
    })),
  };
  const tables = new Map(
    catalog
      .filter((collection) => !/^(asmblyr_|plugin_)/i.test(collection.name))
      .map((collection) => [
        collection.name,
        {
          name: collection.name,
          key: collection.primaryKey.name,
          fields: collection.fields,
        },
      ]),
  );

  function walk(path: string[]) {
    let table = root;
    const steps: ProfileDisplayStep[] = [];
    const signature: unknown[] = [];
    let field: Field | undefined;
    for (let index = 0; index < path.length; index++) {
      field = table.fields.find((entry) => entry.name === path[index]);
      const identity = identities.get(`${table.name}.${path[index]}`);
      if (!field || !identity || !sourceType(field)) {
        throw new InputError("Profile display source is no longer available");
      }
      steps.push({ table: table.name, key: table.key, field: field.name });
      signature.push([
        identity,
        field.type,
        field.relation ?? null,
        sourceType(field),
      ]);
      if (index < path.length - 1) {
        const target =
          field.relation?.kind === "m2o"
            ? tables.get(field.relation.collection)
            : undefined;
        if (!target) {
          throw new InputError(
            "Select a single relation in the profile display path",
          );
        }
        table = target;
      }
    }
    return { table, field, steps, signature };
  }

  function choices(prefix: string[]): ProfileDisplaySource[] {
    let table = root;
    if (prefix.length) {
      const { field } = walk(prefix);
      const target =
        field?.relation?.kind === "m2o"
          ? tables.get(field.relation.collection)
          : undefined;
      if (!target || prefix.length >= 3) {
        return [];
      }
      table = target;
    }
    return table.fields.flatMap((field) => {
      const type = sourceType(field);
      if (
        !type ||
        (type === "relation" &&
          (prefix.length >= 2 ||
            field.relation?.kind !== "m2o" ||
            !tables.has(field.relation.collection)))
      ) {
        return [];
      }
      return [
        {
          name: field.name,
          label: field.presentation?.label || field.name,
          type,
        },
      ];
    });
  }

  function resolve(path: string[]): ProfileDisplayBinding {
    const { field, steps, signature } = walk(path);
    const type = field && sourceType(field);
    if (!type || type === "relation") {
      throw new InputError(
        "Select a value at the end of the profile display path",
      );
    }
    return {
      steps,
      type,
      signature: createHash("sha256")
        .update(JSON.stringify(signature))
        .digest("hex"),
    };
  }
  return { choices, resolve };
}
