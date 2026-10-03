import ts from "typescript";

type Schema = Record<string, unknown>;
const constraintTypes: Record<string, string> = {
  minimum: "number",
  maximum: "number",
  multipleOf: "number",
  minLength: "string",
  maxLength: "string",
  minItems: "array",
  maxItems: "array",
};

function numericConstraint(schema: Schema, tag: string, value: string): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`Invalid @${tag}`);
  const expected = constraintTypes[tag];
  const integerNumber = expected === "number" && schema.type === "integer";
  if (schema.type !== expected && !integerNumber) {
    throw new Error(`@${tag} requires a ${expected} field`);
  }
  if (tag === "multipleOf" && number <= 0) throw new Error("@multipleOf must be positive");
  if (expected !== "number" && (!Number.isInteger(number) || number < 0)) {
    throw new Error(`@${tag} requires a nonnegative integer`);
  }
  return number;
}

/** A small, explicit JSDoc vocabulary. Misspelled constraints must not silently disappear. */
export function applyModelTags(schema: Schema, symbol: ts.Symbol, checker: ts.TypeChecker): Schema {
  const result = { ...schema };
  const description = ts.displayPartsToString(symbol.getDocumentationComment(checker));
  if (description) result.description = description;
  for (const tag of symbol.getJsDocTags(checker)) {
    const value = ts.displayPartsToString(tag.text);
    if (tag.name === "title" || tag.name === "description") {
      result[tag.name] = value;
    } else if (tag.name === "integer") {
      if (result.type !== "number") throw new Error("@integer requires a number field");
      result.type = "integer";
    } else if (Object.hasOwn(constraintTypes, tag.name)) {
      result[tag.name] = numericConstraint(result, tag.name, value);
    } else {
      throw new Error(`Unsupported model annotation @${tag.name} on ${symbol.name}`);
    }
  }
  const bounds = [
    ["minimum", "maximum"],
    ["minLength", "maxLength"],
    ["minItems", "maxItems"],
  ] as const;
  for (const [min, max] of bounds) {
    const lower = result[min];
    const upper = result[max];
    if (typeof lower === "number" && typeof upper === "number" && lower > upper) {
      throw new Error(`Invalid ${min}/${max} on ${symbol.name}`);
    }
  }
  return result;
}
