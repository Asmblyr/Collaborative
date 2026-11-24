import type { collectionSchema } from "../items/schema-repository.js";
import { ToolArgumentError } from "./errors.js";

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
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Every entry in "fields" must be a readable physical field from describe_collection (readableValue=true), the primary key, or an available timestamp. Do not pass wildcards, nested paths, or to-many alias fields.',
        ["fields"],
        'Invalid argument "fields": contains an unknown or unreadable field.',
      );
    }
  }

  return [...new Set([primaryKey, ...requestedFields])];
}
