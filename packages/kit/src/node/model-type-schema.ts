import ts from "typescript";
import { applyModelTags } from "./model-tags.js";

type Schema = Record<string, unknown>;

/** JSON-compatible types only. Unsupported types fail the build instead of weakening validation. */
export function modelTypeSchema(
  checker: ts.TypeChecker,
  root: ts.Type,
  location: ts.Node,
): Schema {
  const visiting = new Set<ts.Type>();
  let nodes = 0;
  function visit(type: ts.Type, depth: number): Schema {
    if (++nodes > 1000 || depth > 20)
      throw new Error("Model type is too complex");
    if (visiting.has(type))
      throw new Error("Recursive model types are not supported");
    const flags = type.flags;
    if (flags & ts.TypeFlags.StringLiteral)
      return { type: "string", const: (type as ts.StringLiteralType).value };
    if (flags & ts.TypeFlags.NumberLiteral)
      return { type: "number", const: (type as ts.NumberLiteralType).value };
    if (flags & ts.TypeFlags.BooleanLiteral)
      return { type: "boolean", const: checker.typeToString(type) === "true" };
    if (flags & ts.TypeFlags.Null) return { type: "null" };
    if (flags & ts.TypeFlags.String) return { type: "string" };
    if (flags & ts.TypeFlags.Number) return { type: "number" };
    if (flags & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (type.isUnion()) {
      return { anyOf: type.types.map((entry) => visit(entry, depth + 1)) };
    }
    if (
      !(flags & ts.TypeFlags.Object) ||
      type.getCallSignatures().length ||
      checker.isTupleType(type)
    ) {
      throw new Error(`Unsupported model type: ${checker.typeToString(type)}`);
    }
    if (type.symbol?.declarations?.some(ts.isClassDeclaration)) {
      throw new Error(
        `Model types must describe JSON, not class ${checker.typeToString(type)}`,
      );
    }
    visiting.add(type);
    try {
      if (checker.isArrayType(type) || type.symbol?.name === "ReadonlyArray") {
        const item = checker.getTypeArguments(type as ts.TypeReference)[0];
        if (!item) throw new Error("Array element type is required");
        return { type: "array", items: visit(item, depth + 1) };
      }
      if (checker.getIndexInfosOfType(type).length) {
        throw new Error(
          "Model object keys must be explicit; index signatures are not supported",
        );
      }
      const properties: Record<string, Schema> = {};
      const required: string[] = [];
      for (const property of checker.getPropertiesOfType(type)) {
        if (property.flags & ts.SymbolFlags.Optional) {
          throw new Error(
            `Model field ${property.name} must be required; use null for an optional value`,
          );
        }
        if (["__proto__", "prototype", "constructor"].includes(property.name)) {
          throw new Error(`Unsupported model field: ${property.name}`);
        }
        const fieldType = checker.getTypeOfSymbolAtLocation(
          property,
          property.valueDeclaration ?? location,
        );
        properties[property.name] = applyModelTags(
          visit(fieldType, depth + 1),
          property,
          checker,
        );
        required.push(property.name);
      }
      return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      };
    } finally {
      visiting.delete(type);
    }
  }
  const result = visit(root, 0);
  if (result.type !== "object")
    throw new Error("Model inputs and outputs must be JSON objects");
  return result;
}
