/** Free-form field dictionaries use provider non-strict mode; Core still validates them. */
export function strictToolSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") {
    return true;
  }
  if (Array.isArray(schema)) {
    return schema.every(strictToolSchema);
  }
  const node = schema as Record<string, unknown>;
  const object =
    node.type === "object" ||
    (Array.isArray(node.type) && node.type.includes("object"));
  if (object && node.additionalProperties !== false) {
    return false;
  }
  return Object.values(node).every(strictToolSchema);
}
