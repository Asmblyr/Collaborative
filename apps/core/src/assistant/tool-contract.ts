import type { AssistantAnswer } from "./provider.js";
import type {
  AssistantSelection,
  AssistantFilterProposal,
  AssistantStreamEvent,
  AssistantActivity,
} from "@asmblyr-collaborative/contracts";
import type { AssistantPluginResult } from "@asmblyr-collaborative/contracts";
import type { AssistantWriteProposalCard } from "./write-proposals.js";
import type { AssistantFormCard, AssistantRecordCard } from "./widgets.js";
import {
  filterDescription,
  toolDefinitions,
  type ToolDefinition,
} from "../tools/tool-definitions.js";

export type FilterProposal = AssistantFilterProposal;

export type AssistantToolDefinition = ToolDefinition;

export interface AssistantTools {
  connectionWrites?: import("@asmblyr-collaborative/contracts").ConnectionWriteProposal[];
  context: object;
  definitions: AssistantToolDefinition[];
  proposals: FilterProposal[];
  selections?: AssistantSelection[];
  pluginResults?: AssistantPluginResult[];
  writeProposals?: AssistantWriteProposalCard[];
  records?: AssistantRecordCard[];
  forms?: AssistantFormCard[];
  execute(name: string, args: unknown, signal?: AbortSignal): Promise<object>;
  close?(): Promise<void>;
}

export interface AssistantRun {
  tools?: AssistantTools;
  onText?(event: Extract<AssistantStreamEvent, { type: "text-delta" }>): void;
  onActivity?(activity: AssistantActivity): void;
  record<T extends AssistantAnswer>(generate: () => Promise<T>): Promise<T>;
  recordTool?(execute: () => Promise<object>, name?: string): Promise<object>;
  remainingModelCalls?(): number;
}

const collectionToolsWithoutPageDefault = new Set([
  "list_skills",
  "read_skill",
  "my_permissions",
  "list_users",
  "list_policies",
  "present_record",
  "present_form",
  "propose_write",
]);

export function assistantToolDefinitions(
  definitions: ToolDefinition[],
  hasTable: boolean,
): AssistantToolDefinition[] {
  const tools = definitions.map((definition) => {
    if (
      !hasTable ||
      !definition.parameters.properties.collection ||
      collectionToolsWithoutPageDefault.has(definition.name)
    )
      return definition;
    return {
      ...definition,
      description: `${definition.description} collection=null uses the current page. For that collection only, q/filter/sort/direction=null inherit table conditions; empty q/filter clear them. Explicit other collections use their own defaults.`,
      parameters: {
        ...definition.parameters,
        properties: {
          ...definition.parameters.properties,
          collection: { type: ["string", "null"], maxLength: 63 },
        },
      },
    };
  });
  if (definitions.some((definition) => definition.name.startsWith("plugin_"))) {
    tools.push({
      name: "present_plugin_result",
      description:
        "Add an Open page button alongside your answer for the prepared form from a successful plugin action in this turn. resultId is prepared.draftId returned by that action. After presenting, explain the actual plugin result in your final message, including useful inputs, totals, units and a brief breakdown when relevant. The button complements this explanation. Navigation requires a user click, even if the user asks to open the page; never claim the browser has already navigated.",
      parameters: {
        type: "object",
        properties: { resultId: { type: "string" } },
        required: ["resultId"],
        additionalProperties: false,
      },
    });
  }
  tools.push({
    name: "present_selection",
    description:
      "Show an Open records card for a successful search_items/count_items result or an aggregate_items group from this turn. Pass its non-null resultId. The card uses server-verified conditions and row count. It can open any readable collection, not just the current page. Does not navigate until the user clicks.",
    parameters: {
      type: "object",
      properties: { resultId: { type: "string" } },
      required: ["resultId"],
      additionalProperties: false,
    },
  });
  if (definitions.some((definition) => definition.name === "read_item")) {
    tools.push({
      name: "present_record",
      description:
        "Show an interactive Open record card for a single readable record by collection and primary key ID. Server verifies read/row permissions and loads a safe title and up to 4 readable summary fields. Pass summary=null when no extra caption is needed. Does not navigate until the user clicks.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            maxLength: 63,
            description: "Technical collection name.",
          },
          id: {
            type: "string",
            minLength: 1,
            maxLength: 255,
            description: "Primary key ID of the record.",
          },
          summary: {
            type: ["string", "null"],
            maxLength: 300,
            description: "Optional short caption for the card, or null.",
          },
        },
        required: ["collection", "id", "summary"],
        additionalProperties: false,
      },
    });
  }
  if (definitions.some((definition) => definition.name === "create_item")) {
    tools.push({
      name: "present_form",
      description:
        "Show an Open creation form card for a collection the user can create records in, optionally prefilled with valid writable field values. Unwritable or unknown fields are stripped server-side. Does not save anything until the user opens and submits the form.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            maxLength: 63,
            description: "Technical collection name.",
          },
          values: {
            type: ["object", "null"],
            additionalProperties: true,
            maxProperties: 50,
            description:
              "Optional dictionary of prefilled writable field values, or null.",
          },
          summary: {
            type: ["string", "null"],
            maxLength: 300,
            description: "Optional short caption for the form card, or null.",
          },
        },
        required: ["collection", "values", "summary"],
        additionalProperties: false,
      },
    });
  }
  if (
    definitions.some(
      (definition) =>
        definition.name === "create_item" || definition.name === "update_item",
    )
  ) {
    tools.push({
      name: "propose_write",
      description:
        "Prepare an interactive confirmation card with a field-by-field diff for creating or updating one record. Validates permissions, field types, and current values without modifying data yet. The write executes only after the user clicks Confirm.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            maxLength: 63,
            description: "Technical collection name.",
          },
          operation: {
            type: "string",
            enum: ["create", "update"],
            description: "Mutation type: create or update.",
          },
          id: {
            type: ["string", "null"],
            maxLength: 255,
            description:
              'Record primary key ID for "update"; must be null for "create".',
          },
          values: {
            type: "object",
            additionalProperties: true,
            maxProperties: 50,
            description: "Field values to create or update (1-50 fields).",
          },
          expectedValues: {
            type: ["object", "null"],
            additionalProperties: true,
            maxProperties: 50,
            description:
              'Optional optimistic concurrency snapshot for "update" (auto-loaded from live record if null); must be null for "create".',
          },
          summary: {
            type: ["string", "null"],
            maxLength: 300,
            description:
              "Optional short summary describing the proposed write.",
          },
        },
        required: ["collection", "operation", "values"],
        additionalProperties: false,
      },
    });
  }
  if (hasTable) {
    tools.push({
      name: "propose_filter",
      description: `${filterDescription} Current page only. Call describe_collection first. The user gets an Apply button. Replaces table filters and preserves search; requires a user click.`,
      parameters: {
        type: "object",
        properties: { filter: { type: "string", maxLength: 8192 } },
        additionalProperties: false,
        required: ["filter"],
      },
    });
  }
  return tools;
}

export const contextToolDefinitions = assistantToolDefinitions(
  toolDefinitions,
  true,
);
