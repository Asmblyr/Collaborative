import type { AssistantAnswer } from "./provider.js";
import type {
  AssistantSelection,
  AssistantFilterProposal,
  AssistantStreamEvent,
  AssistantActivity,
} from "@asmblyr-collaborative/contracts";
import type { AssistantPluginResult } from "@asmblyr-collaborative/contracts";
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

export function assistantToolDefinitions(
  definitions: ToolDefinition[],
  hasTable: boolean,
): AssistantToolDefinition[] {
  const tools = definitions.map((definition) => {
    if (!hasTable || !definition.parameters.properties.collection)
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
