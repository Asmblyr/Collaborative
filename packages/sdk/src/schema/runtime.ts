import type { SchemaSnapshot } from "@asmblyr-collaborative/contracts";

/** Technical names determine aliases; display names and translations never do. */
export function generateRuntimeSchema(snapshot: SchemaSnapshot): string[] {
  const definitions: Record<string, object> = Object.create(null);
  const aliases: Record<string, string> = Object.create(null);
  const plugins: Record<string, Record<string, string>> = Object.create(null);
  for (const method of snapshot.methods ?? []) {
    plugins[method.namespace] ??= Object.create(null);
    plugins[method.namespace][method.id] = method.path;
  }
  for (const collection of snapshot.collections) {
    const fields: Record<string, object> = Object.create(null);
    for (const field of collection.fields) {
      if (!collection.actions.read || !field.read) {
        continue;
      }
      fields[field.name] = {
        // Older snapshots have no database semantics; expose only safe scalar equality.
        kind:
          field.filterKind ??
          (["json", "strings"].includes(field.type) ? "none" : "scalar"),
        nullable: field.nullable,
      };
    }
    definitions[collection.name] = fields;
    if (!collection.actions.read) {
      continue;
    }
    const base = collection.name
      .split("_")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("");
    let alias = base;
    for (let suffix = 2; Object.hasOwn(aliases, alias); suffix++) {
      alias = `${base}_${suffix}`;
    }
    aliases[alias] = collection.name;
  }
  return [
    "/** Runtime descriptors for collection(), aliases and typed query callbacks. */",
    "export const schema = defineSchema<Schema, PluginMethods>()(",
    `  ${JSON.stringify(definitions, null, 2)},`,
    `  ${JSON.stringify(aliases, null, 2)},`,
    `  ${JSON.stringify(plugins, null, 2)},`,
    ");",
    "",
  ];
}
