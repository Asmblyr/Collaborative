import type { Knex } from "knex";
import { requireGrant, type Access } from "../permissions/access.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { parseItemListQuery } from "../items/list-query.js";
import { plainFilter } from "../items/filter-wire.js";
import { listWorkspaces } from "../workspaces/service.js";
import { ItemError } from "../items/validation.js";
import { collectionData } from "../tools/collection-data.js";
import { executeDataTool } from "../tools/data-tools.js";
import type { AssistantContext } from "./context-input.js";

export async function pageSnapshot(
  db: Knex,
  access: Access,
  context: AssistantContext,
) {
  const workspace = context.workspaceId
    ? (await listWorkspaces(db, access)).workspaces.find(
        (entry) => entry.id === context.workspaceId,
      )
    : null;
  if (context.workspaceId && !workspace) {
    throw new ItemError("Workspace not found", 404);
  }
  const snapshot = {
    page: context.page,
    workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
  };
  if (!context.collection || (!context.table && !context.record)) {
    return { snapshot, collectionId: null, enabled: true };
  }

  const name = context.collection;
  requireGrant(access, name, "read");
  if ((await findCollectionSettings(db, name))?.mcp?.enabled === false) {
    return {
      snapshot: { ...snapshot, collectionToolsAvailable: false },
      collectionId: null,
      enabled: false,
    };
  }
  const data = await collectionData(db, access, name);
  if (context.record) {
    // Read only the key to verify row access. Values remain behind the ordinary
    // MCP read boundary and are requested by the model only when needed.
    const result = await executeDataTool(
      db,
      access,
      name,
      data.schema.settings.internalId,
      "read_item",
      { id: context.record.id, fields: [data.schema.settings.primaryKey.name] },
    );
    if (!("found" in result) || !result.found) {
      throw new ItemError("Item not found", 404);
    }
    return {
      snapshot: {
        ...snapshot,
        collection: name,
        displayName: data.schema.settings.displayName || name,
        record: { id: context.record.id, saved: true },
      },
      collectionId: data.schema.settings.internalId,
      enabled: true,
    };
  }
  const table = context.table!;
  const query = parseItemListQuery(
    {
      page: String(table.page),
      limit: String(table.size),
      sort: table.sort,
      order: table.order,
      direction: table.direction,
      q: table.q,
      filter: table.filter || undefined,
    },
    name,
    data.schema,
    data.allowed,
    data.catalog,
    access,
  );
  return {
    snapshot: {
      ...snapshot,
      collection: name,
      displayName: data.schema.settings.displayName || name,
      table: { ...table, filter: plainFilter(query.filters) },
    },
    collectionId: data.schema.settings.internalId,
    enabled: true,
  };
}
