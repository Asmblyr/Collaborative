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

export const unavailableToolResult = {
  error:
    "Request unavailable, invalid or timed out. Access or schema may have changed. Use only readable fields and documented arguments; do not infer data or counts from this error.",
};

/** One server-created identity and schema snapshot map per assistant turn. */
export function createToolSession(
  db: Knex,
  access: Access,
  reloadAccess: () => Promise<Access>,
  pinnedCollections: ReadonlyMap<string, string> = new Map(),
) {
  requireHuman(access);
  const principalId = access.principal.id;
  const identities = new Map(pinnedCollections);
  const described = new Set<string>();

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
    const definition = toolDefinitions.find((tool) => tool.name === name);
    if (!definition) throw new ItemError("Tool unavailable", 400);
    const body = { ...objectInput(args, definition.parameters.required) };
    // Older internal clients predate terms. The advertised strict schema still
    // requires an explicit null when the model does not select any terms.
    if (
      Object.hasOwn(definition.parameters.properties, "terms") &&
      !Object.hasOwn(body, "terms")
    ) {
      body.terms = null;
    }
    if (
      definition.parameters.required.some((key) => !Object.hasOwn(body, key))
    ) {
      throw new ItemError("Missing tool arguments", 400);
    }
    if (name === "list_collections") {
      const result = await discoverCollections(db, currentAccess, body);
      signal?.throwIfAborted();
      return result;
    }

    const collection = toolCollectionName(body.collection);
    const parameters = { ...body };
    delete parameters.collection;
    if (isDataTool(name) || name === "aggregate_items") {
      const id = identities.get(collection);
      if (!described.has(collection) || !id)
        throw new ItemError("Call describe_collection first", 400);
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
      return {
        ...describeCollection(collection, data, currentAccess),
        ...(await describeTerms(db, collection, data, currentAccess)),
      };
    }
    if (!described.has(collection))
      throw new ItemError("Call describe_collection first", 400);
    return validateToolFilter(collection, body.filter, data, currentAccess);
  }

  return { authorize, execute };
}
