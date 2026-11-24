import type { Knex } from "knex";
import type { AssistantSkillChannel } from "@asmblyr-collaborative/contracts";
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
import {
  describeCollectionSkills,
  formatSkillMarkdown,
  listVisibleSkills,
  readVisibleSkill,
} from "../skills/visibility.js";
import { isValidSkillSlug } from "../skills/validation.js";
import { executeAggregateTool } from "./aggregate-tool.js";
import {
  executeListPolicies,
  executeListUsers,
  executeMyPermissions,
} from "./directory-tools.js";
import { ToolArgumentError } from "./errors.js";
import { executeWriteTool } from "./write-tools.js";
import type { MutationFactory } from "../items/mutation-context.js";
export { unavailableToolResult } from "./errors.js";

function formatSkillsIndexMarkdown(
  skills: Awaited<ReturnType<typeof listVisibleSkills>>,
): string {
  const lines = ["# Доступные умения", ""];
  if (skills.length === 0) {
    lines.push("_Нет доступных умений._");
    return `${lines.join("\n")}\n`;
  }
  for (const skill of skills) {
    const scope =
      skill.scope === "collections" && skill.collections.length
        ? ` (коллекции: ${skill.collections.join(", ")})`
        : " (глобальное)";
    lines.push(
      `- **${skill.title}** (\`skill://${skill.slug}\`)${scope}: ${skill.description}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseOptionalToolText(
  value: unknown,
  key: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    value.includes("\0")
  ) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      `Fix argument "${key}": expected a string up to ${maxLength} characters or null.`,
      [key],
      `Invalid argument "${key}".`,
    );
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** One server-created identity and schema snapshot map per assistant turn. */
export function createToolSession(
  db: Knex,
  access: Access,
  reloadAccess: () => Promise<Access>,
  pinnedCollections: ReadonlyMap<string, string> = new Map(),
  options: {
    mutations?: MutationFactory;
    source?: string;
    channel?: AssistantSkillChannel;
    schemas?: {
      load(name: string): Promise<string | undefined>;
      save(name: string, id: string): Promise<void>;
    };
  } = {},
) {
  requireHuman(access);
  const channel: AssistantSkillChannel = options.channel ?? "assistant";
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
    // Older clients and non-strict models may omit optional/nullable keys.
    // The advertised schema keeps explicit fields for strict providers while
    // omitted defaults fall back safely here.
    const nullableKeys = [
      "collection",
      "workspace",
      "q",
      "filter",
      "terms",
      "sort",
      "direction",
      "order",
      "orderBy",
      "status",
      "delegatableOnly",
    ];
    for (const key of nullableKeys) {
      const prop = definition.parameters.properties[key] as
        | { type?: unknown }
        | undefined;
      const isNullable =
        Array.isArray(prop?.type) && prop.type.includes("null");
      if (
        isNullable &&
        (!Object.hasOwn(body, key) || body[key] === undefined)
      ) {
        body[key] = null;
      }
    }
    const defaultFallbacks: Record<string, unknown> = {
      page: 1,
      limit: 20,
      groupBy: [],
    };
    for (const [key, fallback] of Object.entries(defaultFallbacks)) {
      if (
        Object.hasOwn(definition.parameters.properties, key) &&
        (!Object.hasOwn(body, key) || body[key] === undefined)
      ) {
        body[key] = Array.isArray(fallback) ? [...fallback] : fallback;
      }
    }
    const missing = definition.parameters.required.filter(
      (key) => !Object.hasOwn(body, key) || body[key] === undefined,
    );
    if (missing.length) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        `Provide the required argument(s): ${missing.join(", ")}. Use null for nullable defaults.`,
        missing,
        `Missing required argument(s): ${missing.join(", ")}.`,
      );
    }
    if (name === "my_permissions") {
      return executeMyPermissions(db, currentAccess, body, signal);
    }
    if (name === "list_users") {
      return executeListUsers(db, currentAccess, body, signal);
    }
    if (name === "list_policies") {
      return executeListPolicies(db, currentAccess, body, signal);
    }
    if (name === "list_collections") {
      const result = await discoverCollections(db, currentAccess, body);
      signal?.throwIfAborted();
      return result;
    }
    if (name === "list_skills") {
      const rawCollection = parseOptionalToolText(
        body.collection,
        "collection",
        63,
      );
      const collectionFilter = rawCollection
        ? toolCollectionName(rawCollection)
        : null;
      const workspace = parseOptionalToolText(body.workspace, "workspace", 120);
      const q = parseOptionalToolText(body.q, "q", 200);
      const skills = await listVisibleSkills(db, currentAccess, {
        channel,
        collection: collectionFilter,
        workspace,
        q,
        limit: 50,
      });
      signal?.throwIfAborted();
      return { skills };
    }
    if (name === "read_skill") {
      if (
        typeof body.slug !== "string" ||
        body.slug.length > 64 ||
        !isValidSkillSlug(body.slug.trim().toLowerCase())
      ) {
        throw new ToolArgumentError(
          "INVALID_ARGUMENTS",
          'Fix argument "slug": expected a valid skill slug (lowercase letters, digits, "-" or "_").',
          ["slug"],
          'Invalid argument "slug".',
        );
      }
      const slug = body.slug.trim().toLowerCase();
      const detail = await readVisibleSkill(db, currentAccess, slug, {
        channel,
      });
      signal?.throwIfAborted();
      return detail
        ? { found: true, skill: detail }
        : { found: false, skill: null };
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
        ...(await describeCollectionSkills(db, id, currentAccess, { channel })),
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

  async function listSkillResources(signal?: AbortSignal) {
    const currentAccess = await authorize(signal);
    const skills = await listVisibleSkills(db, currentAccess, {
      channel,
      limit: 100,
    });
    signal?.throwIfAborted();
    return [
      {
        uri: "skill://index",
        name: "skills-index",
        description: "Каталог доступных умений ассистента",
        mimeType: "text/markdown",
      },
      ...skills.map((skill) => ({
        uri: `skill://${skill.slug}`,
        name: skill.title,
        description: skill.description,
        mimeType: "text/markdown",
      })),
    ];
  }

  async function readSkillResource(uri: string, signal?: AbortSignal) {
    const currentAccess = await authorize(signal);
    if (uri === "skill://index") {
      const skills = await listVisibleSkills(db, currentAccess, {
        channel,
        limit: 100,
      });
      signal?.throwIfAborted();
      return {
        uri: "skill://index",
        mimeType: "text/markdown",
        text: formatSkillsIndexMarkdown(skills),
      };
    }
    if (!uri.startsWith("skill://")) {
      return null;
    }
    const slug = uri.slice("skill://".length);
    if (!isValidSkillSlug(slug)) {
      return null;
    }
    const detail = await readVisibleSkill(db, currentAccess, slug, { channel });
    signal?.throwIfAborted();
    if (!detail) {
      return null;
    }
    return {
      uri: `skill://${detail.slug}`,
      mimeType: "text/markdown",
      text: formatSkillMarkdown(detail),
    };
  }

  async function listSkillPrompts(signal?: AbortSignal) {
    const currentAccess = await authorize(signal);
    const skills = await listVisibleSkills(db, currentAccess, {
      channel,
      limit: 100,
    });
    signal?.throwIfAborted();
    return skills.map((skill) => ({
      name: `skill:${skill.slug}`,
      description: `${skill.title} — ${skill.description}`,
      arguments: [
        {
          name: "input",
          description: "Дополнительный запрос или параметры пользователя",
          required: false,
        },
      ],
    }));
  }

  async function getSkillPrompt(
    name: string,
    args?: Record<string, string>,
    signal?: AbortSignal,
  ) {
    const currentAccess = await authorize(signal);
    if (!name.startsWith("skill:")) {
      return null;
    }
    const slug = name.slice("skill:".length);
    if (!isValidSkillSlug(slug)) {
      return null;
    }
    const detail = await readVisibleSkill(db, currentAccess, slug, { channel });
    signal?.throwIfAborted();
    if (!detail) {
      return null;
    }
    const userInput = typeof args?.input === "string" ? args.input.trim() : "";
    return {
      description: `${detail.title} — ${detail.description}`,
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: formatSkillMarkdown(detail),
          },
        },
        ...(userInput
          ? [
              {
                role: "user" as const,
                content: {
                  type: "text" as const,
                  text: userInput,
                },
              },
            ]
          : []),
      ],
    };
  }

  return {
    authorize,
    definitions,
    execute,
    listSkillResources,
    readSkillResource,
    listSkillPrompts,
    getSkillPrompt,
  };
}
