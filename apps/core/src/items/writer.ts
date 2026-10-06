import { mutationContext } from "./mutation-context.js";
import type {
  ItemCommitResult,
  ItemMutationResult,
  ItemRecord,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { grantFor, requireGrant, type Access } from "../permissions/access.js";
import type { MutationContext } from "./events-repository.js";
import { commitRecordDraft } from "./record-draft.js";
import { requireRelatedRead } from "./related.js";
import { createItem, deleteItem, getItem, updateItem } from "./service.js";

async function readableResult(
  transaction: Knex.Transaction,
  access: Access,
  collection: string,
  item: ItemRecord,
): Promise<ItemMutationResult> {
  const readable = grantFor(access, collection, "read");
  if (!readable) {
    return { data: null };
  }
  const settings = await findCollectionSettings(transaction, collection);
  try {
    return {
      data: await getItem(
        transaction,
        collection,
        String(item[settings!.primaryKey.name]),
        readable,
        undefined,
        access,
      ),
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 404
    )
      return { data: null };
    throw error;
  }
}

/** Shared authorization and audit boundary for HTTP and kit mutations. */
export async function createAuthorizedItem(
  database: Knex,
  access: Access,
  collection: string,
  values: unknown,
  mutation: MutationContext = mutationContext(access),
): Promise<ItemMutationResult> {
  mutation = { ...mutation, access };
  const allowed = requireGrant(access, collection, "create");
  return database.transaction(async (transaction) => {
    await requireRelatedRead(transaction, collection, values, access);
    const item = await createItem(
      transaction,
      collection,
      values,
      mutation,
      allowed,
    );
    return readableResult(transaction, access, collection, item);
  });
}

export async function updateAuthorizedItem(
  database: Knex,
  access: Access,
  collection: string,
  id: string,
  values: unknown,
  mutation: MutationContext = mutationContext(access),
): Promise<ItemMutationResult> {
  mutation = { ...mutation, access };
  const allowed = requireGrant(access, collection, "update");
  return database.transaction(async (transaction) => {
    await requireRelatedRead(transaction, collection, values, access);
    const item = await updateItem(
      transaction,
      collection,
      id,
      values,
      mutation,
      allowed,
    );
    return readableResult(transaction, access, collection, item);
  });
}

export async function deleteAuthorizedItem(
  database: Knex,
  access: Access,
  collection: string,
  id: string,
  mutation: MutationContext = mutationContext(access),
): Promise<void> {
  mutation = { ...mutation, access };
  requireGrant(access, collection, "delete");
  await deleteItem(database, collection, id, mutation);
}

export async function commitAuthorizedItems(
  database: Knex,
  access: Access,
  collection: string,
  draft: unknown,
  mutation: MutationContext = mutationContext(access),
): Promise<ItemCommitResult> {
  const data = await commitRecordDraft(database, collection, draft, access, {
    ...mutation,
    access,
  });
  return { data };
}
