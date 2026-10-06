import type { SchemaPluginMethod } from "@asmblyr-collaborative/contracts";
function jsonType(node: Record<string, unknown>): string {
  if ("const" in node) {
    return JSON.stringify(node.const);
  }
  if (Array.isArray(node.enum)) {
    return node.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (Array.isArray(node.anyOf)) {
    return node.anyOf.map((branch) => `(${jsonType(branch)})`).join(" | ");
  }
  if (Array.isArray(node.type)) {
    return node.type.map((type) => jsonType({ ...node, type })).join(" | ");
  }
  if (node.type === "object") {
    const properties = node.properties as Record<
      string,
      Record<string, unknown>
    >;
    return `{ ${Object.entries(properties)
      .map(([name, value]) => `${JSON.stringify(name)}: ${jsonType(value)};`)
      .join(" ")} }`;
  }
  if (node.type === "array") {
    return `(${jsonType(node.items as Record<string, unknown>)})[]`;
  }
  if (node.type === "integer" || node.type === "number") {
    return "number";
  }
  return String(node.type);
}
export function generatePluginTypes(
  methods: readonly SchemaPluginMethod[] = [],
): string[] {
  const groups = new Map<string, SchemaPluginMethod[]>();
  for (const method of methods) {
    const group = groups.get(method.namespace) ?? [];
    group.push(method);
    groups.set(method.namespace, group);
  }
  const lines = ["export interface PluginMethods {"];
  for (const [namespace, methods] of groups) {
    lines.push(`  ${JSON.stringify(namespace)}: {`);
    for (const method of methods) {
      lines.push(
        `    ${JSON.stringify(method.id)}: { input: ${jsonType(method.inputSchema)}; output: ${jsonType(method.outputSchema)} };`,
      );
    }
    lines.push("  };");
  }
  return [...lines, "}", ""];
}
