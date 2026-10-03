import type { Knex } from "knex";
import { requireGrant, type Access } from "../permissions/access.js";
import { collectionSchema } from "../items/schema-repository.js";
import { ItemError } from "../items/validation.js";
import { requireMcpCollection } from "./collection-scope.js";
import { toolCollectionName } from "./collection-data.js";

/** Shared schema/identity boundary inside a read-only tool transaction. */
export async function toolReadContext(
  trx: Knex.Transaction,
  access: Access,
  name: string,
  collectionId: string,
  signal?: AbortSignal,
) {
  toolCollectionName(name);
  const allowed = requireGrant(access, name, "read");
  signal?.throwIfAborted();
  await trx.raw("SET LOCAL statement_timeout = '5s'");
  await trx.raw("LOCK TABLE ?? IN ACCESS SHARE MODE", [`public.${name}`]);
  const schema = await collectionSchema(trx, name);
  requireMcpCollection(schema.settings);
  if (schema.settings.internalId !== collectionId)
    throw new ItemError("Collection changed", 409);
  signal?.throwIfAborted();
  return { schema, allowed };
}
