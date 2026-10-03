import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import {
  AccessDeniedError,
  grantFor,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import { collectionSchema } from "./schema-repository.js";
import type { AliasRow } from "./related-aliases.js";
import { ItemError, parseCollectionName, parseItemId } from "./validation.js";

export interface RelationAddress {
  collection: string;
  id: string;
  field: string;
}
export const fieldGranted = (fields: string[] | null, name: string) =>
  Boolean(fields?.includes("*") || fields?.includes(name));

export async function relationContext(
  database: Knex,
  address: RelationAddress,
  access: Access,
  lock = false,
) {
  const { collection, field } = address;
  parseCollectionName(collection);
  const readable = requireGrant(access, collection, "read");
  if (!fieldGranted(readable, field)) throw new AccessDeniedError();
  const aliases = database<AliasRow>("asmblyr_relation_aliases")
    .withSchema("public")
    .where({ collection_name: collection, field_name: field });
  if (lock) aliases.forShare();
  const alias = await aliases.first();
  if (!alias) throw new ItemError("Relation field not found", 404);
  const parent = await collectionSchema(database, collection);
  const id = parseItemId(address.id, parent.settings.primaryKey.type);
  const row = database(collection)
    .withSchema("public")
    .where(parent.settings.primaryKey.name, id);
  applyRowAccess(row, database, access, collection, "read", [field]);
  if (lock) row.forNoKeyUpdate();
  if (!(await row.first(parent.settings.primaryKey.name)))
    throw new ItemError("Item not found", 404);
  const allowed = requireGrant(access, alias.related_collection, "read");
  if (alias.kind === "o2m" && !fieldGranted(allowed, alias.through_field))
    throw new AccessDeniedError();
  const target = await collectionSchema(database, alias.related_collection);
  const through =
    alias.kind === "o2m"
      ? target
      : await collectionSchema(database, alias.through_collection);
  const foreignKey = through.fields.get(alias.through_field);
  const bridgeFields = [
    alias.through_field,
    ...(alias.related_field ? [alias.related_field] : []),
  ];
  const attach =
    alias.kind === "o2m"
      ? fieldGranted(
          grantFor(access, alias.related_collection, "update"),
          alias.through_field,
        )
      : bridgeFields.every((name) =>
          fieldGranted(
            grantFor(access, alias.through_collection, "create"),
            name,
          ),
        );
  const detach =
    alias.kind === "o2m"
      ? attach && foreignKey?.nullable === true && !foreignKey.required
      : Boolean(grantFor(access, alias.through_collection, "delete"));
  const createGrant = grantFor(access, alias.related_collection, "create");
  const create =
    Boolean(createGrant) &&
    (alias.kind === "o2m"
      ? fieldGranted(createGrant, alias.through_field)
      : attach);
  return {
    alias,
    id,
    target,
    through,
    allowed,
    abilities: { attach, detach, create },
  };
}

export type RelationContext = Awaited<ReturnType<typeof relationContext>>;
