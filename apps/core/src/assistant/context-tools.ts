import type { Knex } from "knex";
import type { PluginActions } from "../plugins/actions.js";
import { PluginResults } from "./plugin-results.js";
import type { AssistantSelection } from "@asmblyr/contracts";
import { captureSelection, validateSelection } from "./selections.js";
import { captureAggregateSelections } from "./aggregate-selections.js";
import { requireGrant, type Access } from "../permissions/access.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { parseItemListQuery } from "../items/list-query.js";
import { plainFilter } from "../items/filter-wire.js";
import { listWorkspaces } from "../workspaces/service.js";
import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { parseId } from "../policies/validation.js";
import { connectInternalMcp } from "../mcp/internal-client.js";
import {
  collectionData,
  toolCollectionName,
} from "../tools/collection-data.js";
import { createToolSession, unavailableToolResult } from "../tools/session.js";
import { validateToolFilter } from "../tools/filter.js";
import {
  parseAssistantContext,
  type AssistantContext,
} from "./context-input.js";
import {
  assistantToolDefinitions,
  type AssistantTools,
  type FilterProposal,
} from "./tool-contract.js";

async function pageSnapshot(
  db: Knex,
  access: Access,
  context: AssistantContext,
) {
  const workspace = context.workspaceId
    ? (await listWorkspaces(db, access)).workspaces.find(
        (entry) => entry.id === context.workspaceId,
      )
    : null;
  if (context.workspaceId && !workspace)
    throw new ItemError("Workspace not found", 404);
  const snapshot = {
    page: context.page,
    workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
  };
  if (!context.collection || !context.table)
    return { snapshot, collectionId: null, enabled: true };

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
  const table = context.table;
  const query = parseItemListQuery(
    {
      page: String(table.page),
      limit: String(table.size),
      sort: table.sort,
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

function contextualArguments(
  name: string,
  args: Record<string, unknown>,
  context: AssistantContext,
): Record<string, unknown> {
  if (name === "list_collections") return args;
  const collection = toolCollectionName(args.collection ?? context.collection);
  const resolved: Record<string, unknown> = { ...args, collection };
  if (collection === context.collection && context.table) {
    for (const key of ["q", "filter", "sort", "direction"] as const) {
      if (resolved[key] === null) resolved[key] = context.table[key];
    }
  }
  return resolved;
}

export async function createContextTools(
  db: Knex,
  access: Access,
  context: AssistantContext | null,
  reloadAccess: () => Promise<Access>,
  actions?: PluginActions,
): Promise<AssistantTools | undefined> {
  // Keep the existing explicit context-off mode: plain chat, no data tools.
  if (!context) return undefined;
  const page = await pageSnapshot(db, access, context);
  const selections: AssistantSelection[] = [];
  const pluginResults = new PluginResults();
  const tools: AssistantTools = {
    context: page.snapshot,
    definitions: [],
    proposals: [],
    selections,
    pluginResults: pluginResults.cards,
    execute: async () => unavailableToolResult,
  };
  if (!page.enabled) return tools;

  const pinned = new Map<string, string>();
  if (context.collection && page.collectionId)
    pinned.set(context.collection, page.collectionId);
  const session = createToolSession(db, access, reloadAccess, pinned);
  const mcp = await connectInternalMcp(session, actions);
  tools.close = () => mcp.close();
  tools.definitions = assistantToolDefinitions(
    mcp.definitions,
    Boolean(context.table),
  );
  const results = new Map<string, AssistantSelection>();
  tools.execute = async (name, args, signal) => {
    try {
      const definition = tools.definitions.find((tool) => tool.name === name);
      if (!definition) return unavailableToolResult;
      const body = objectInput(
        args,
        Object.keys(definition.parameters.properties),
      );
      signal?.throwIfAborted();
      if (name === "present_plugin_result") {
        return pluginResults.present(
          actions,
          await session.authorize(signal),
          body,
        );
      }
      if (name === "present_selection") {
        const selection =
          typeof body.resultId === "string"
            ? results.get(body.resultId)
            : undefined;
        if (!selection) return unavailableToolResult;
        const { collection, collectionId, q, filter, sort, direction } =
          selection;
        await validateSelection(db, await session.authorize(signal), {
          collection,
          collectionId,
          q,
          filter,
          sort,
          direction,
        });
        signal?.throwIfAborted();
        if (
          !selections.some((entry) => entry.resultId === selection.resultId)
        ) {
          selections.push(selection);
        }
        return { presented: true, requiresUserClick: true };
      }
      if (name === "propose_filter") {
        if (!context.collection || !page.collectionId)
          return unavailableToolResult;
        const result = await mcp.call(
          "validate_filter",
          { collection: context.collection, filter: body.filter },
          signal,
        );
        if (
          !("filter" in result) ||
          !result.filter ||
          typeof result.filter !== "object"
        )
          return result;
        const proposal: FilterProposal = {
          type: "filter",
          collection: context.collection,
          collectionDisplayName:
            "displayName" in result && typeof result.displayName === "string"
              ? result.displayName
              : context.collection,
          collectionId: page.collectionId,
          workspaceId: context.workspaceId,
          filter: result.filter,
        };
        tools.proposals.splice(0, tools.proposals.length, proposal);
        return {
          proposed: true,
          filter: result.filter,
          requiresUserClick: true,
        };
      }
      const resolvedArgs = Object.hasOwn(
        definition.parameters.properties,
        "collection",
      )
        ? contextualArguments(name, body, context)
        : body;
      const result = await mcp.call(name, resolvedArgs, signal);
      if (actions?.hasTool(name)) {
        pluginResults.capture(result);
        return result;
      }
      if (name === "aggregate_items") {
        const captured = captureAggregateSelections(result);
        for (const selection of captured.selections)
          results.set(selection.resultId, selection);
        return captured.result;
      }
      const selection = captureSelection(name, result);
      if (!selection) return result;
      results.set(selection.resultId, selection);
      return { ...result, resultId: selection.resultId };
    } catch {
      return unavailableToolResult;
    }
  };
  return tools;
}

export async function validateFilterProposal(
  db: Knex,
  access: Access,
  value: unknown,
) {
  const body = objectInput(value, ["context", "collectionId", "filter"]);
  if (
    !body.filter ||
    typeof body.filter !== "object" ||
    Array.isArray(body.filter)
  ) {
    throw new ItemError("Filter group required", 400);
  }
  const context = parseAssistantContext(body.context);
  if (!context?.collection)
    throw new ItemError("Collection context required", 400);
  const page = await pageSnapshot(db, access, context);
  const data = await collectionData(db, access, context.collection);
  if (
    data.schema.settings.internalId !== parseId(body.collectionId) ||
    page.collectionId !== data.schema.settings.internalId
  ) {
    throw new ItemError("Collection changed; request a new proposal", 409);
  }
  return {
    filter: validateToolFilter(
      context.collection,
      JSON.stringify(body.filter),
      data,
      access,
    ).filter,
  };
}
