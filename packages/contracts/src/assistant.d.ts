import type { AssistantTurnSummary } from "./index.js";
import type { AssistantPluginResult } from "./plugin-actions.js";

export interface AssistantFilterProposal<Filter extends object = object> {
  type: "filter";
  collection: string;
  collectionDisplayName?: string;
  collectionId: string;
  workspaceId: string | null;
  filter: Filter;
}

/** A snapshot of a successfully executed query, never model-authored navigation. */
export interface AssistantSelection {
  type: "selection";
  resultId: string;
  collection: string;
  collectionId: string;
  displayName: string;
  q: string;
  filter: object;
  sort: string;
  direction: "asc" | "desc";
  count: string | null;
}

export interface AssistantProgress {
  phase: "model" | "tool";
  label: string;
  modelCalls: number;
  toolCalls: number;
}

export type AssistantSelectionQuery = Pick<
  AssistantSelection,
  "collection" | "q" | "filter" | "sort" | "direction"
>;

export type AssistantStreamEvent =
  | { type: "started"; requestId: string }
  | { type: "progress"; progress: AssistantProgress }
  /** reset starts a new public-text paragraph; preceding model steps stay visible. */
  | { type: "text-delta"; delta: string; reset: boolean }
  | {
      type: "answer";
      data: {
        /** All public model steps in order, including the final answer. */
        content: string;
        truncated: boolean;
        summary: AssistantTurnSummary;
        selections?: AssistantSelection[];
        proposals?: AssistantFilterProposal[];
        pluginResults?: AssistantPluginResult[];
      };
    }
  | {
      type: "error";
      code: string;
      message: string;
      summary?: AssistantTurnSummary;
    };
