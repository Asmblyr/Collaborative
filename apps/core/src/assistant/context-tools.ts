import { currentUserIdentity, pageSnapshot } from "./page-context.js";
import type { MutationFactory } from "../items/mutation-context.js";
import type { Knex } from "knex";
import type { PluginActions } from "../plugins/actions.js";
import type { GoogleConnections } from "../connections/google/connections.js";
import { GoogleWrites } from "../connections/google/writes.js";
import { toolErrorResult } from "../tools/errors.js";
import { PluginResults } from "./plugin-results.js";
import type {
  AssistantSelection,
  AssistantSkillDetail,
  AssistantDataAccess,
} from "@asmblyr-collaborative/contracts";
import { assistantDataEnabled } from "./data-access.js";
import { captureSelection, validateSelection } from "./selections.js";
import { captureAggregateSelections } from "./aggregate-selections.js";
import type { Access } from "../permissions/access.js";
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
import { listVisibleSkills, readVisibleSkill } from "../skills/visibility.js";
import { AssistantProviderError } from "./provider-error.js";
import {
  parseAssistantContext,
  type AssistantContext,
} from "./context-input.js";
import {
  assistantToolDefinitions,
  type AssistantTools,
  type FilterProposal,
} from "./tool-contract.js";
import type { SessionSchemaCache } from "./session-schema-cache.js";
import {
  WriteProposalStore,
  type AssistantWriteProposalCard,
} from "./write-proposals.js";
import {
  buildFormCard,
  buildRecordCard,
  type AssistantFormCard,
  type AssistantRecordCard,
} from "./widgets.js";

const MAX_CONTEXT_SKILLS = 30;
const MAX_CONTEXT_SKILLS_CHARS = 12_000;

const noContextInjectionTools = new Set([
  "list_collections",
  "list_skills",
  "read_skill",
  "my_permissions",
  "list_users",
  "list_policies",
  "present_record",
  "present_form",
  "propose_write",
]);

function isNullableProperty(property: unknown): boolean {
  if (!property || typeof property !== "object" || !("type" in property)) {
    return false;
  }
  const type = (property as { type?: unknown }).type;
  return Array.isArray(type) && type.includes("null");
}

function compactAvailableSkills(
  skills: Awaited<ReturnType<typeof listVisibleSkills>>,
) {
  const result: {
    slug: string;
    title: string;
    description: string;
    scope: string;
    collections?: string[];
  }[] = [];
  let size = 0;
  for (const skill of skills) {
    if (result.length >= MAX_CONTEXT_SKILLS) break;
    const entry = {
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      scope: skill.scope,
      ...(skill.collections.length ? { collections: skill.collections } : {}),
    };
    const length = JSON.stringify(entry).length;
    if (size + length > MAX_CONTEXT_SKILLS_CHARS) continue;
    result.push(entry);
    size += length;
  }
  return result;
}

export function contextualArguments(
  name: string,
  args: Record<string, unknown>,
  context: AssistantContext,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  if (noContextInjectionTools.has(name)) {
    return args;
  }
  const collection = toolCollectionName(args.collection ?? context.collection);
  const resolved: Record<string, unknown> = { ...args, collection };
  if (collection === context.collection && context.table) {
    for (const key of ["q", "filter", "sort", "direction"] as const) {
      if (
        Object.hasOwn(properties, key) &&
        isNullableProperty(properties[key]) &&
        (resolved[key] === null || resolved[key] === undefined)
      ) {
        const inherited = context.table[key];
        // The page explicitly supplies this literal query; preserve its case-insensitive scope.
        resolved[key] =
          key === "q" && inherited === "null" ? "NULL" : inherited;
      }
    }
    if (
      name === "search_items" &&
      Object.hasOwn(properties, "order") &&
      args.order == null
    ) {
      const inheritsSort = args.sort == null && args.direction == null;
      resolved.order = inheritsSort
        ? (context.table.order ?? "field")
        : "field";
    }
  }
  return resolved;
}

export interface CreateContextToolsOptions {
  sessionId?: string | null;
  schemaCache?: SessionSchemaCache;
  writeProposals?: WriteProposalStore;
}

export async function createContextTools(
  db: Knex,
  access: Access,
  context: AssistantContext | null,
  reloadAccess: () => Promise<Access>,
  actions?: PluginActions,
  google: GoogleConnections | null = null,
  dataAccess?: AssistantDataAccess,
  mutations?: MutationFactory,
  skillSlug: string | null = null,
  options: CreateContextToolsOptions = {},
): Promise<AssistantTools | undefined> {
  const dataEnabled = assistantDataEnabled(context, dataAccess);
  let activeSkill: AssistantSkillDetail | undefined;
  if (skillSlug) {
    const resolved = await readVisibleSkill(db, access, skillSlug, {
      channel: "assistant",
    });
    if (!resolved) {
      throw new AssistantProviderError(
        404,
        "skill_unavailable",
        "Выбранное умение недоступно или не найдено.",
      );
    }
    activeSkill = resolved;
  }
  if (!context && !dataEnabled) {
    if (!activeSkill) {
      return undefined;
    }
    return {
      context: {
        pageContextProvided: false,
        dataAccessEnabled: false,
        activeSkill,
      },
      definitions: [],
      proposals: [],
      selections: [],
      pluginResults: [],
      connectionWrites: [],
      writeProposals: [],
      records: [],
      forms: [],
      execute: async () => unavailableToolResult,
    };
  }
  // Workspace remains an explicit conversation scope when the page is omitted.
  // It does not grant collection access; every tool keeps ordinary ACL/MCP checks.
  const page = await pageSnapshot(
    db,
    access,
    context ?? {
      page: "home",
      workspaceId: dataAccess?.workspaceId ?? null,
    },
  );
  const currentUser = dataEnabled
    ? await currentUserIdentity(db, access)
    : undefined;
  const availableSkills =
    dataEnabled && page.enabled
      ? compactAvailableSkills(
          await listVisibleSkills(db, access, {
            channel: "assistant",
            collection: context?.collection ?? null,
            workspaceId:
              context?.workspaceId ?? dataAccess?.workspaceId ?? null,
            limit: MAX_CONTEXT_SKILLS,
          }),
        )
      : [];
  const skillContext = {
    ...(availableSkills.length ? { availableSkills } : {}),
    ...(activeSkill ? { activeSkill } : {}),
  };
  const snapshot = context
    ? {
        ...page.snapshot,
        ...(currentUser ? { currentUser } : {}),
        ...skillContext,
      }
    : {
        workspace: page.snapshot.workspace,
        ...(currentUser ? { currentUser } : {}),
        ...skillContext,
      };
  const selections: AssistantSelection[] = [];
  const pluginResults = new PluginResults();
  const writeProposalCards: AssistantWriteProposalCard[] = [];
  const recordCards: AssistantRecordCard[] = [];
  const formCards: AssistantFormCard[] = [];
  const writeProposalStore = options.writeProposals ?? new WriteProposalStore();
  const sessionId = options.sessionId ?? null;
  const tools: AssistantTools = {
    context: dataAccess
      ? {
          ...snapshot,
          pageContextProvided: Boolean(context),
          dataAccessEnabled: dataEnabled,
        }
      : snapshot,
    definitions: [],
    proposals: [],
    selections,
    pluginResults: pluginResults.cards,
    connectionWrites: [],
    writeProposals: writeProposalCards,
    records: recordCards,
    forms: formCards,
    execute: async () => unavailableToolResult,
  };
  if (!dataEnabled) {
    return tools;
  }
  const googleAvailable = Boolean(
    google && (await google.available(access.principal.id)),
  );
  if (!page.enabled && !googleAvailable) return tools;

  const pinned = new Map<string, string>();
  if (context?.collection && page.collectionId) {
    pinned.set(context.collection, page.collectionId);
  }
  const session = createToolSession(db, access, reloadAccess, pinned, {
    mutations,
    channel: "assistant",
    ...(sessionId && options.schemaCache
      ? {
          schemas: options.schemaCache.forSession(
            sessionId,
            access.principal.id,
            db,
            reloadAccess,
          ),
        }
      : {}),
  });
  const mcp = await connectInternalMcp(session, actions);
  tools.close = () => mcp.close();
  tools.definitions = assistantToolDefinitions(
    page.enabled
      ? mcp.definitions
      : mcp.definitions.filter((tool) =>
          tool.name.startsWith("plugin_google__"),
        ),
    page.enabled && Boolean(context?.table),
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
        const { collection, collectionId, q, filter, sort, direction, order } =
          selection;
        await validateSelection(db, await session.authorize(signal), {
          collection,
          collectionId,
          q,
          filter,
          sort,
          direction,
          ...(order ? { order } : {}),
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
        if (!context?.collection || !page.collectionId)
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
      if (name === "propose_write") {
        const { card, toolResult } = await writeProposalStore.propose(
          db,
          await session.authorize(signal),
          sessionId,
          body,
          signal,
        );
        signal?.throwIfAborted();
        writeProposalCards.push(card);
        return toolResult;
      }
      if (name === "present_record") {
        const { card, toolResult } = await buildRecordCard(
          db,
          await session.authorize(signal),
          body,
          signal,
        );
        signal?.throwIfAborted();
        const existingIndex = recordCards.findIndex(
          (entry) =>
            entry.collection === card.collection &&
            entry.recordId === card.recordId,
        );
        if (existingIndex < 0) recordCards.push(card);
        else recordCards[existingIndex] = card;
        return toolResult;
      }
      if (name === "present_form") {
        const { card, toolResult } = await buildFormCard(
          db,
          await session.authorize(signal),
          body,
          signal,
        );
        signal?.throwIfAborted();
        formCards.push(card);
        return toolResult;
      }
      const resolvedArgs =
        Object.hasOwn(definition.parameters.properties, "collection") &&
        context &&
        !noContextInjectionTools.has(name)
          ? contextualArguments(
              name,
              body,
              context,
              definition.parameters.properties,
            )
          : body;
      const result = await mcp.call(name, resolvedArgs, signal);
      if (actions?.hasTool(name)) {
        pluginResults.capture(result);
        if (
          google &&
          "output" in result &&
          result.output &&
          typeof result.output === "object" &&
          "id" in result.output &&
          "provider" in result.output &&
          result.output.provider === "google" &&
          typeof result.output.id === "string"
        ) {
          const verified = await new GoogleWrites(google).get(
            access.principal.id,
            result.output.id,
          );
          if (
            !tools.connectionWrites!.some((entry) => entry.id === verified.id)
          ) {
            tools.connectionWrites!.push(verified);
          }
        }
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
    } catch (error) {
      return toolErrorResult(error);
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
  if (!context?.collection || !context.table || context.record) {
    throw new ItemError("Collection context required", 400);
  }
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
