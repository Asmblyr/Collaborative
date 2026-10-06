import type {
  ItemListOptions,
  ItemListResult,
  JsonRecord,
} from "@asmblyr-collaborative/contracts";
import type { AsmblyrContext } from "./endpoint.js";
import type { CollectionDefinition } from "./collection.js";
import type {
  CollectionCreate,
  CollectionRow,
  CollectionUpdate,
} from "./collection-types.js";
import { collectionRow } from "./storage-row.js";

type ListOptions<Definition extends CollectionDefinition> = Omit<
  ItemListOptions<keyof CollectionRow<Definition> & string>,
  "fields"
>;

/** Full rows only. Use raw storage for field projections. */
export interface CollectionStorage<Definition extends CollectionDefinition> {
  list(
    options?: ListOptions<Definition>,
  ): Promise<ItemListResult<CollectionRow<Definition>>>;
  get(id: string | number): Promise<CollectionRow<Definition>>;
  create(
    values: CollectionCreate<Definition>,
  ): Promise<CollectionRow<Definition>>;
  update(
    id: string | number,
    values: CollectionUpdate<Definition>,
  ): Promise<CollectionRow<Definition>>;
  delete(id: string | number): Promise<void>;
}

/** Bind an installed declaration to the current package's request-scoped storage. */
export function useStorage<Definition extends CollectionDefinition>(
  context: Pick<AsmblyrContext, "storage">,
  definition: Definition,
): CollectionStorage<Definition> {
  const storage = context.storage;
  if (!storage) {
    throw new Error(
      "Plugin storage is unavailable outside a namespaced request",
    );
  }
  const name = definition.name;

  function savedRow(
    row: Record<string, unknown> | null,
  ): CollectionRow<Definition> {
    if (!row) {
      throw new Error(`Plugin storage did not return the saved row: ${name}`);
    }
    return collectionRow(definition, row);
  }

  return Object.freeze({
    async list(options) {
      if (options && "fields" in options) {
        throw new Error(
          "Typed storage returns full rows; use raw storage for projections",
        );
      }
      const result = await storage.list(name, options);
      return {
        ...result,
        data: result.data.map((row) => collectionRow(definition, row)),
      };
    },
    async get(id) {
      const result = await storage.get(name, id);
      return collectionRow(definition, result.data);
    },
    async create(values) {
      const result = await storage.create(name, values as JsonRecord);
      return savedRow(result.data);
    },
    async update(id, values) {
      const result = await storage.update(name, id, values as JsonRecord);
      return savedRow(result.data);
    },
    delete: (id) => storage.delete(name, id),
  } satisfies CollectionStorage<Definition>);
}
