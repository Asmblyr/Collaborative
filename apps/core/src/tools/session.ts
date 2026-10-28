import type { Knex } from "knex";
import {
  AccessDeniedError,
  requireHuman,
  type Access,
} from "../permissions/access.js";
import { ItemError } from "../items/validation.js";
import { objectInput } from "../shared/input.js";
import { collectionData, toolCollectionName } from "./collection-data.js";
import { describeCollection } from "./describe-collection.js";
import { discoverCollections } from "./list-collections.js";
import { isDataTool } from "./data-tool-input.js";
import { executeDataTool } from "./data-tools.js";
import { validateToolFilter } from "./filter.js";
import { toolDefinitions } from "./tool-definitions.js";
import { describeTerms } from "../terms/filters.js";
import { executeAggregateTool } from "./aggregate-tool.js";
import { ToolArgumentError } from "./errors.js";
import { executeWriteTool } from "./write-tools.js";
import type { MutationFactory } from "../items/mutation-context.js";
export { unavailableToolResult } from "./errors.js";

/** One server-created identity and schema snapshot map per assistant turn. */
export function createToolSession(
  db: Knex,
  access: Access,
  reloadAccess: () => Promise<Access>,
  pinnedCollections: ReadonlyMap<string, string> = new Map(),
  options: {
    mutations?: MutationFactory;
    source?: string;
    schemas?: {
      load(name: string): Promise<string | undefined>;
      save(name: string, id: string): Promise<void>;
    };
  } = {},
) {
  requireHuman(access);
  const principalId = access.principal.id;
  const identities = new Map(pinnedCollections);
  const described = new Set<string>();

  function definitions(current: Access) {
    return toolDefinitions.filter((tool) => {
      const action =
        tool.name === "create_item"
          ? "create"
          : ["prepare_update", "update_item"].includes(tool.name)
            ? "update"
            : null;
      return (
        !action ||
        (!current.readOnly &&
          (current.principal.superuser ||
            [...current.grants.keys()].some((key) =>
              key.endsWith(`:${action}`),
            )))
      );
    });
  }

  async function authorize(signal?: AbortSignal): Promise<Access> {
    signal?.throwIfAborted();
    const current = await reloadAccess();
    requireHuman(current);
    if (current.principal.id !== principalId) throw new AccessDeniedError();
    signal?.throwIfAborted();
    return current;
  }

  async function execute(
    name: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<object> {
    const currentAccess = await authorize(signal);
    const definition = definitions(currentAccess).find(
      (tool) => tool.name === name,
    );
    if (!definition) throw new ItemError("Tool unavailable", 400);
    const body = { ...objectInput(args, definition.parameters.required) };
    // Older internal clients predate terms/order. The advertised model schema
    // still requires explicit null; omitted optional defaults stay compatible.
    for (const key of ["terms", "order"]) {
      if (
        Object.hasOwn(definition.parameters.properties, key) &&
        !Object.hasOwn(body, key)
      ) {
        body[key] = null;
      }
    }
    const missing = definition.parameters.required.filter(
      (key) => !Object.hasOwn(body, key),
    );
    if (missing.length) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        "Provide the missing arguments; use null for nullable defaults.",
        missing,
      );
    }
    if (name === "list_collections") {
      const result = await discoverCollections(db, currentAccess, body);
      signal?.throwIfAborted();
      return result;
    }

    const collection = toolCollectionName(body.collection);
    const parameters = { ...body };
    delete parameters.collection;
    if (
      name !== "describe_collection" &&
      !described.has(collection) &&
      options.schemas
    ) {
      const saved = await options.schemas.load(collection);
      if (saved) {
        identities.set(collection, saved);
        described.add(collection);
      }
    }
    if (["create_item", "prepare_update", "update_item"].includes(name)) {
      const id = identities.get(collection);
      if (!id || !described.has(collection))
        throw new ToolArgumentError(
          "SCHEMA_REQUIRED",
          "Call describe_collection before writing records.",
        );
      return executeWriteTool(
        db,
        currentAccess,
        collection,
        id,
        name,
        parameters,
        options,
        signal,
      );
    }
    if (isDataTool(name) || name === "aggregate_items") {
      const id = identities.get(collection);
      if (!described.has(collection) || !id) {
        throw new ToolArgumentError(
          "SCHEMA_REQUIRED",
          "Call describe_collection for this collection before reading data or validating a filter.",
        );
      }
      if (name === "aggregate_items")
        return executeAggregateTool(
          db,
          currentAccess,
          collection,
          id,
          parameters,
          signal,
        );
      return executeDataTool(
        db,
        currentAccess,
        collection,
        id,
        name,
        parameters,
        signal,
      );
    }

    const data = await collectionData(db, currentAccess, collection);
    signal?.throwIfAborted();
    const id = data.schema.settings.internalId;
    const expectedId = identities.get(collection);
    if (expectedId && expectedId !== id)
      throw new ItemError("Collection changed", 409);
    if (name === "describe_collection") {
      identities.set(collection, id);
      described.add(collection);
      await options.schemas?.save(collection, id);
      return {
        ...(await describeCollection(db, collection, data, currentAccess)),
        ...(await describeTerms(db, collection, data, currentAccess)),
      };
    }
    if (!described.has(collection)) {
      throw new ToolArgumentError(
        "SCHEMA_REQUIRED",
        "Call describe_collection for this collection before reading data or validating a filter.",
      );
    }
    return validateToolFilter(collection, body.filter, data, currentAccess);
  }

  return { authorize, definitions, execute };
}
