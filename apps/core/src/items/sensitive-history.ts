import type { Knex } from "knex";

const marker = "[REDACTED]";

export async function sensitiveFields(
  db: Knex,
  name: string,
): Promise<string[]> {
  const rows = await db("asmblyr_field_metadata")
    .withSchema("public")
    .where({ collection_name: name })
    .select("field_name", "presentation");
  return rows
    .filter((row) => row.presentation?.sensitive === true)
    .map((row) => row.field_name);
}

export function redactItemValues(
  row: Record<string, unknown> | null,
  fields: string[],
): Record<string, unknown> | null {
  if (row === null) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      fields.includes(key) ? marker : value,
    ]),
  );
}

/** Enabling redaction permanently scrubs this field in existing events. */
export async function redactExistingFieldHistory(
  db: Knex,
  collectionId: string,
  field: string,
): Promise<void> {
  await db.raw(
    `UPDATE public.asmblyr_item_events SET
    before = CASE WHEN jsonb_exists(before, ?) THEN jsonb_set(before, ARRAY[?]::text[], ?::jsonb) ELSE before END,
    after = CASE WHEN jsonb_exists(after, ?) THEN jsonb_set(after, ARRAY[?]::text[], ?::jsonb) ELSE after END
    WHERE collection_id = ? AND (jsonb_exists(before, ?) OR jsonb_exists(after, ?))`,
    [
      field,
      field,
      JSON.stringify(marker),
      field,
      field,
      JSON.stringify(marker),
      collectionId,
      field,
      field,
    ],
  );
}
