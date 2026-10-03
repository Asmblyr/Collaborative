import { ItemError } from "../items/validation.js";
import type { collectionSchema } from "../items/schema-repository.js";

type CollectionSchema = Awaited<ReturnType<typeof collectionSchema>>;

export function dataProjection(
  schema: CollectionSchema,
  allowedFields: string[],
  requestedFields: string[],
): string[] {
  const { settings, fields } = schema;
  const primaryKey = settings.primaryKey.name;
  const canReadAll = allowedFields.includes("*");

  for (const field of requestedFields) {
    if (field === primaryKey) {
      continue;
    }

    const isReadable = canReadAll || allowedFields.includes(field);
    const isCreatedAt = field === "created_at" && settings.timestamps.createdAt;
    const isUpdatedAt = field === "updated_at" && settings.timestamps.updatedAt;
    const isKnown = fields.has(field) || isCreatedAt || isUpdatedAt;

    if (!isReadable || !isKnown) {
      throw new ItemError("Invalid data tool arguments", 400);
    }
  }

  return [...new Set([primaryKey, ...requestedFields])];
}
