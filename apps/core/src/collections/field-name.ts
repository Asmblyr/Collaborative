import type { Knex } from "knex";
import { CollectionFieldConflictError } from "./validation.js";

export async function assertNoAlias(
  database: Knex,
  collection: string,
  field: string,
): Promise<void> {
  const alias = await database("asmblyr_relation_aliases")
    .withSchema("public")
    .where({ collection_name: collection, field_name: field })
    .first("field_name");
  if (alias)
    throw new CollectionFieldConflictError(`Field already exists: ${field}`);
}
