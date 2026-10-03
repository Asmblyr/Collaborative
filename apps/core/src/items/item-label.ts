export function itemLabelField(
  key: string,
  fields: Iterable<{ name: string; type: string | null }>,
  configured: string | null | undefined,
  allowed: string[],
): string {
  const readable = (name: string) =>
    name === key || allowed.includes("*") || allowed.includes(name);
  const entries = [...fields];
  if (configured)
    return readable(configured) &&
      (configured === key ||
        entries.some(
          (field) =>
            field.name === configured &&
            ["text", "email", "integer"].includes(field.type ?? ""),
        ))
      ? configured
      : key;
  return (
    entries.find(
      (field) =>
        ["text", "email"].includes(field.type ?? "") && readable(field.name),
    )?.name ?? key
  );
}

export function itemLabel(value: unknown, id: unknown): string {
  return (
    typeof value === "string" && value.trim()
      ? value
      : typeof value === "number"
        ? String(value)
        : String(id)
  ).slice(0, 160);
}
