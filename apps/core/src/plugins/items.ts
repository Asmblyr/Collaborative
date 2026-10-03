import type { ItemsService } from "@asmblyr/kit";
import type { Knex } from "knex";
import { readItem, readItemList } from "../items/reader.js";
import {
  createAuthorizedItem,
  updateAuthorizedItem,
  deleteAuthorizedItem,
  commitAuthorizedItems,
} from "../items/writer.js";
import type { Access } from "../permissions/access.js";
import {
  mutationContext,
  type MutationFactory,
} from "../items/mutation-context.js";
import {
  pluginCollectionName,
  pluginItemId,
  pluginListQuery,
  pluginReadFields,
} from "./items-input.js";

/** Access belongs to this request; no actor or permission override is exposed. */
export function createItemsService(
  database: Knex,
  access: Access,
  mutation: MutationFactory = mutationContext,
): ItemsService {
  const items: ItemsService = {
    async list(collection, options) {
      return readItemList(
        database,
        access,
        pluginCollectionName(collection),
        pluginListQuery(options),
      );
    },
    async get(collection, id, options) {
      return readItem(
        database,
        access,
        pluginCollectionName(collection),
        pluginItemId(id),
        pluginReadFields(options),
      );
    },
    async create(collection, values) {
      return createAuthorizedItem(
        database,
        access,
        pluginCollectionName(collection),
        values,
        mutation(access),
      );
    },
    async update(collection, id, values) {
      return updateAuthorizedItem(
        database,
        access,
        pluginCollectionName(collection),
        pluginItemId(id),
        values,
        mutation(access),
      );
    },
    async delete(collection, id) {
      await deleteAuthorizedItem(
        database,
        access,
        pluginCollectionName(collection),
        pluginItemId(id),
        mutation(access),
      );
    },
    async commit(collection, draft) {
      return commitAuthorizedItems(
        database,
        access,
        pluginCollectionName(collection),
        draft,
        mutation(access),
      );
    },
  };
  return Object.freeze(items);
}
