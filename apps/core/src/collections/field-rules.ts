import type {
  FieldRules,
  RelationChoiceFilter,
  FormCondition,
} from "@asmblyr-collaborative/contracts";
import { objectInput } from "../shared/input.js";
import { CollectionInputError } from "./validation.js";

const name = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(v);

export function parseFieldRules(input: unknown): FieldRules {
  const value = objectInput(input, [
    "hidden",
    "readonly",
    "requiredWhen",
    "computed",
  ]);
  const result: FieldRules = {};
  for (const key of ["hidden", "readonly"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") {
        throw new CollectionInputError(`Expected boolean: ${key}`);
      }
      result[key] = value[key];
    }
  }
  if (value.requiredWhen !== undefined) {
    const c = objectInput(value.requiredWhen, ["mode", "rules"]);
    if (
      !["all", "any"].includes(String(c.mode)) ||
      !Array.isArray(c.rules) ||
      !c.rules.length ||
      c.rules.length > 12
    ) {
      throw new CollectionInputError("Expected 1–12 required conditions");
    }
    result.requiredWhen = {
      mode: c.mode as "all" | "any",
      rules: c.rules.map((input): FormCondition["rules"][number] => {
        const rule = objectInput(input, ["field", "operator", "value"]);
        if (
          !name(rule.field) ||
          !["eq", "ne", "empty", "notEmpty"].includes(String(rule.operator))
        ) {
          throw new CollectionInputError("Invalid required condition");
        }
        if (["empty", "notEmpty"].includes(String(rule.operator))) {
          if (rule.value !== undefined) {
            throw new CollectionInputError("Empty checks have no value");
          }
        } else if (
          !["string", "number", "boolean"].includes(typeof rule.value) ||
          (typeof rule.value === "string" &&
            (rule.value.length > 500 || rule.value.includes("\0"))) ||
          (typeof rule.value === "number" && !Number.isFinite(rule.value))
        ) {
          throw new CollectionInputError("Invalid required operand");
        }
        return {
          field: rule.field,
          operator: rule.operator as FormCondition["rules"][number]["operator"],
          ...(rule.value === undefined
            ? {}
            : { value: rule.value as string | number | boolean }),
        };
      }),
    };
  }
  if (value.computed !== undefined) {
    const c = objectInput(value.computed, ["relation", "field"]);
    if (!name(c.relation) || !name(c.field)) {
      throw new CollectionInputError("Use a relation and one related field");
    }
    result.computed = { relation: c.relation, field: c.field };
  }
  return result;
}

export function parseRelationChoiceFilter(
  input: unknown,
): RelationChoiceFilter {
  let nodes = 0;
  const walk = (input: unknown, depth: number): RelationChoiceFilter => {
    const group = objectInput(input, ["logic", "children"]);
    if (
      depth > 3 ||
      !["and", "or"].includes(String(group.logic)) ||
      !Array.isArray(group.children) ||
      !group.children.length ||
      group.children.length > 20
    ) {
      throw new CollectionInputError("Invalid relation filter group");
    }
    return {
      logic: group.logic as "and" | "or",
      children: group.children.map((input) => {
        if (++nodes > 30) {
          throw new CollectionInputError("Too many relation filter nodes");
        }
        if (input && typeof input === "object" && "logic" in input) {
          return walk(input, depth + 1);
        }
        const c = objectInput(input, ["field", "op", "quantifier", "value"]);
        if (
          typeof c.field !== "string" ||
          c.field.split(".").length > 2 ||
          !c.field.split(".").every(name) ||
          typeof c.op !== "string"
        ) {
          throw new CollectionInputError(
            "Invalid relation filter field/operator",
          );
        }
        if (
          c.quantifier !== undefined &&
          !["some", "none"].includes(String(c.quantifier))
        ) {
          throw new CollectionInputError("Invalid quantifier");
        }
        if (c.value !== undefined) {
          const v = objectInput(c.value, ["kind", "field", "value"]);
          if (v.kind === "field") {
            if (!name(v.field) || "value" in v) {
              throw new CollectionInputError("Invalid draft field operand");
            }
          } else if (
            v.kind !== "literal" ||
            "field" in v ||
            !Object.hasOwn(v, "value") ||
            !validLiteral(v.value)
          ) {
            throw new CollectionInputError(
              "Expected literal or draft field operand",
            );
          }
        }
        return c as unknown as RelationChoiceFilter["children"][number];
      }),
    };
  };
  return walk(input, 0);
}

function validLiteral(value: unknown): boolean {
  const scalar = (v: unknown) =>
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v)) ||
    (typeof v === "string" && v.length <= 800 && !v.includes("\0"));
  return (
    scalar(value) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 100 &&
      value.every(scalar))
  );
}
