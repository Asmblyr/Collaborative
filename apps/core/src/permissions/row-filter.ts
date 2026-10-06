import {
  permissionContextParameters,
  type PermissionFilter,
  type PermissionContextPath,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import type { Principal } from "../auth/principal.js";
import { parseItemFilters, type FilterGroup } from "../items/filter-input.js";
import { resolveFilterField } from "../items/filter-fields.js";
import { collectionSchema } from "../items/schema-repository.js";

const invalid = () =>
  Object.assign(new Error("Invalid permission condition"), { statusCode: 400 });
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const examples: Record<PermissionContextPath, string> = {
  "user.id": "00000000-0000-4000-8000-000000000001",
  "user.email": "user@example.test",
  "service.id": "00000000-0000-4000-8000-000000000001",
  "actor.id": "00000000-0000-4000-8000-000000000001",
  "request.now": "2026-01-01T00:00:00.000Z",
};

export function parseRowFilter(input: unknown): PermissionFilter | null {
  if (input === null) return null;
  if (JSON.stringify(input)?.length > 8192) throw invalid();
  let nodes = 0;
  let conditions = 0;
  function node(value: unknown, depth: number): void {
    if (!object(value) || ++nodes > 30) throw invalid();
    if ("logic" in value) {
      if (
        depth > 3 ||
        !["and", "or"].includes(String(value.logic)) ||
        !Array.isArray(value.children) ||
        !value.children.length ||
        value.children.length > 20 ||
        Object.keys(value).some((key) => !["logic", "children"].includes(key))
      )
        throw invalid();
      value.children.forEach((child) => node(child, depth + 1));
    } else {
      if (
        ++conditions > 20 ||
        typeof value.field !== "string" ||
        !/^[a-z][a-z0-9_]{0,62}$/.test(value.field) ||
        typeof value.op !== "string" ||
        ["exists", "notExists"].includes(value.op) ||
        Object.keys(value).some(
          (key) => !["field", "op", "value"].includes(key),
        )
      )
        throw invalid();
      if ("value" in value) {
        const operand = value.value;
        if (!object(operand) || Object.keys(operand).length !== 2)
          throw invalid();
        if (operand.kind === "context") {
          if (
            !permissionContextParameters.some(
              (entry) => entry.path === operand.path,
            )
          )
            throw invalid();
        } else if (operand.kind === "literal") {
          if (
            typeof operand.value !== "string" &&
            (!Array.isArray(operand.value) ||
              operand.value.some((part) => typeof part !== "string"))
          )
            throw invalid();
        } else throw invalid();
      }
    }
  }
  node(input, 1);
  if (!object(input) || !("logic" in input)) throw invalid();
  function canonical(group: PermissionFilter): PermissionFilter {
    return {
      logic: group.logic,
      children: group.children.map((child) =>
        "logic" in child
          ? canonical(child)
          : {
              field: child.field,
              op: child.op,
              ...(child.value
                ? {
                    value:
                      child.value.kind === "context"
                        ? { kind: "context", path: child.value.path }
                        : {
                            kind: "literal",
                            value: structuredClone(child.value.value),
                          },
                  }
                : {}),
            },
      ),
    };
  }
  return canonical(input as unknown as PermissionFilter);
}

type Schema = Awaited<ReturnType<typeof collectionSchema>>;

export function compileRowFilter(
  filter: PermissionFilter,
  name: string,
  schema: Schema,
  context: Partial<Record<PermissionContextPath, string>>,
): FilterGroup {
  // Validate structure even for persisted JSON: stale or externally modified rules fail closed.
  parseRowFilter(filter);
  function plain(group: PermissionFilter): object {
    return {
      logic: group.logic,
      children: group.children.map((child) => {
        if ("logic" in child) return plain(child);
        const operand = child.value;
        if (operand?.kind === "context") {
          const parameter = permissionContextParameters.find(
            (entry) => entry.path === operand.path,
          )!;
          const field = resolveFilterField(
            child.field,
            name,
            schema,
            ["*"],
            [],
          );
          const compatible =
            parameter.type === "datetime"
              ? field.type === "datetime"
              : parameter.type === "email"
                ? ["text", "email"].includes(field.type)
                : field.type === "text" ||
                  (field.type === "key" && field.keyType === "uuid");
          if (!compatible || context[operand.path] === undefined)
            throw invalid();
        }
        return {
          field: child.field,
          op: child.op,
          ...(operand
            ? {
                value:
                  operand.kind === "literal"
                    ? operand.value
                    : context[operand.path],
              }
            : {}),
        };
      }),
    };
  }
  return parseItemFilters(JSON.stringify(plain(filter)), name, schema, ["*"]);
}

export async function validateRowFilter(
  db: Knex,
  name: string,
  filter?: PermissionFilter | null,
): Promise<void> {
  if (filter)
    compileRowFilter(filter, name, await collectionSchema(db, name), examples);
}

export function permissionContext(
  principal: Principal,
): Partial<Record<PermissionContextPath, string>> {
  return {
    "actor.id": principal.id,
    "request.now": new Date().toISOString(),
    ...(principal.kind === "user"
      ? { "user.id": principal.id, "user.email": principal.email }
      : { "service.id": principal.id }),
  };
}
