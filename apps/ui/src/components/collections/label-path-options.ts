import type { Collection } from "@/components/items/types";

/** Only scalar paths through at most two M2O relations can be inserted. */
export function labelPathOptions(
  collection: Collection,
  catalog: Collection[],
  depth = 0,
  prefix = "",
  title = "",
): { value: string; label: string }[] {
  const readable = collection.access.read;
  if (!readable) {
    return [];
  }
  const options = [
    {
      value: prefix + collection.primaryKey.name,
      label: title + collection.primaryKey.name,
    },
  ];
  for (const field of collection.fields) {
    if (
      field.presentation?.sensitive ||
      (!readable.includes("*") && !readable.includes(field.name))
    ) {
      continue;
    }
    const value = prefix + field.name;
    const label = title + (field.presentation?.label || field.name);
    if (!["alias", "json", "file", "files"].includes(field.type)) {
      options.push({ value, label });
    }
    const target = catalog.find((c) => c.name === field.relation?.collection);
    if (depth < 2 && field.relation?.kind === "m2o" && target) {
      options.push(
        ...labelPathOptions(
          target,
          catalog,
          depth + 1,
          value + ".",
          label + " → ",
        ),
      );
    }
  }
  return options;
}
