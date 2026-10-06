import type { SchemaPluginMethod } from "@asmblyr-collaborative/contracts";
function isLiteral(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return (
    value === null || typeof value === "string" || typeof value === "boolean"
  );
}
/** Kit's bounded JSON subset. No $ref, arbitrary defaults, executable values or open objects. */
export function parseModelSchema(input: unknown): Record<string, unknown> {
  let count = 0;
  const keys = new Set([
    "$schema",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "anyOf",
    "const",
    "enum",
    "title",
    "description",
    "minimum",
    "maximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
  ]);
  function visit(value: unknown, depth: number): void {
    if (
      ++count > 1000 ||
      depth > 20 ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new TypeError("Unsupported plugin JSON schema");
    }
    const node = value as Record<string, unknown>;
    if (Object.keys(node).some((key) => !keys.has(key))) {
      throw new TypeError("Unsupported plugin schema keyword");
    }
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (node.anyOf !== undefined) {
      if (!Array.isArray(node.anyOf) || !node.anyOf.length) {
        throw new TypeError("Invalid plugin union");
      }
      node.anyOf.forEach((branch) => visit(branch, depth + 1));
    } else if (
      types.some(
        (type) =>
          ![
            "object",
            "array",
            "string",
            "integer",
            "number",
            "boolean",
            "null",
          ].includes(String(type)),
      )
    ) {
      throw new TypeError("Unsupported plugin type");
    }
    if (types.includes("object")) {
      if (
        !node.properties ||
        typeof node.properties !== "object" ||
        Array.isArray(node.properties) ||
        node.additionalProperties !== false ||
        !Array.isArray(node.required)
      ) {
        throw new TypeError(
          "Plugin objects must have closed required properties",
        );
      }
      const properties = node.properties as Record<string, unknown>;
      const required = node.required as unknown[];
      if (
        required.some(
          (key) => typeof key !== "string" || !Object.hasOwn(properties, key),
        ) ||
        Object.keys(properties).some((key) => !required.includes(key))
      ) {
        throw new TypeError("Invalid plugin required properties");
      }
      Object.values(properties).forEach((property) =>
        visit(property, depth + 1),
      );
    }
    if (types.includes("array")) {
      visit(node.items, depth + 1);
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        ["title", "description", "$schema"].includes(key) &&
        typeof value !== "string"
      ) {
        throw new TypeError("Invalid plugin annotation");
      }
      if (
        [
          "minimum",
          "maximum",
          "multipleOf",
          "minLength",
          "maxLength",
          "minItems",
          "maxItems",
        ].includes(key) &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new TypeError("Invalid plugin constraint");
      }
      if (key === "const" && !isLiteral(value)) {
        throw new TypeError("Invalid plugin literal");
      }
      if (
        key === "enum" &&
        (!Array.isArray(value) ||
          !value.length ||
          value.some((part) => !isLiteral(part)))
      ) {
        throw new TypeError("Invalid plugin enum");
      }
    }
  }
  visit(input, 0);
  if ((input as Record<string, unknown>).type !== "object") {
    throw new TypeError("Plugin input/output root must be an object");
  }
  return JSON.parse(JSON.stringify(input));
}
export function parsePluginMethods(input: unknown): SchemaPluginMethod[] {
  if (!Array.isArray(input) || input.length > 1000) {
    throw new TypeError("Invalid plugin methods");
  }
  const seen = new Set<string>();
  return input.map((raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (key) =>
          !["namespace", "id", "path", "inputSchema", "outputSchema"].includes(
            key,
          ),
      )
    ) {
      throw new TypeError("Invalid plugin method");
    }
    const { namespace, id, path, inputSchema, outputSchema } = raw;
    if (
      typeof namespace !== "string" ||
      !/^[a-z][a-z0-9_]{0,30}$/.test(namespace) ||
      typeof id !== "string" ||
      !/^[a-z][a-z0-9-]{0,31}$/.test(id) ||
      typeof path !== "string" ||
      !/^\/[a-z][a-z0-9_]*(?:\/[a-zA-Z0-9_-]+)+$/.test(path) ||
      path.split("/")[1] !== namespace ||
      path.split("/").slice(2).join("-") !== id ||
      seen.has(`${namespace}:${id}`)
    ) {
      throw new TypeError("Invalid or duplicate plugin method address");
    }
    seen.add(`${namespace}:${id}`);
    return {
      namespace,
      id,
      path,
      inputSchema: parseModelSchema(inputSchema),
      outputSchema: parseModelSchema(outputSchema),
    };
  });
}
