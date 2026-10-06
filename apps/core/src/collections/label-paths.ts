import type { Collection } from "./types.js";
import { grantFor, type Access } from "../permissions/access.js";

const scalar = new Set([
  "text",
  "email",
  "integer",
  "bigint",
  "date",
  "decimal",
  "boolean",
  "datetime",
  "uuid",
  "relation",
]);

/** Up to two M2O hops; no arrays, recursion or arbitrary SQL expressions. */
export function labelTemplatePaths(
  source: Collection,
  catalog: Collection[],
  depth = 0,
): string[] {
  const paths = [source.primaryKey.name];
  for (const field of source.fields) {
    if (field.presentation?.sensitive) {
      continue;
    }
    if (scalar.has(field.type)) {
      paths.push(field.name);
    }
    if (depth < 2 && field.relation?.kind === "m2o") {
      const target = catalog.find((c) => c.name === field.relation!.collection);
      if (target) {
        paths.push(
          ...labelTemplatePaths(target, catalog, depth + 1).map(
            (p) => `${field.name}.${p}`,
          ),
        );
      }
    }
  }
  return paths;
}

export function canReadLabelPath(
  path: string,
  source: Collection,
  catalog: Collection[],
  access: Access,
): boolean {
  let collection = source;
  const parts = path.split(".");
  if (parts.length > 3) {
    return false;
  }
  for (const [index, part] of parts.entries()) {
    const allowed = grantFor(access, collection.name, "read");
    if (
      !allowed ||
      (part !== collection.primaryKey.name &&
        !allowed.includes("*") &&
        !allowed.includes(part))
    ) {
      return false;
    }
    const field = collection.fields.find((f) => f.name === part);
    if (field?.presentation?.sensitive) {
      return false;
    }
    if (index < parts.length - 1) {
      if (field?.relation?.kind !== "m2o") {
        return false;
      }
      const target = catalog.find((c) => c.name === field.relation!.collection);
      if (!target) {
        return false;
      }
      collection = target;
    } else if (
      part !== collection.primaryKey.name &&
      (!field || !scalar.has(field.type))
    ) {
      return false;
    }
  }
  return true;
}
