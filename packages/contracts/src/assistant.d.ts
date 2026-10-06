import type { AssistantTurnSummary } from "./index.js";
import type { AssistantPluginResult } from "./plugin-actions.js";

/** Explicit per-turn tool access, independent of the current page snapshot. */
export interface AssistantDataAccess {
  enabled: boolean;
  /** Conversation scope, not a grant of access to workspace collections. */
  workspaceId: string | null;
}

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
  order?: import("./items.js").ItemOrder;
  count: string | null;
}

export interface AssistantProgress {
  phase: "model" | "tool";
  label: string;
  modelCalls: number;
  toolCalls: number;
}

/** Public work log, separate from the answer and future model context. */
export interface AssistantActivity {
  kind: "status" | "note";
  text: string;
}

export type AssistantSelectionQuery = Pick<
  AssistantSelection,
  "collection" | "q" | "filter" | "sort" | "direction" | "order"
>;

export type AssistantStreamEvent =
  | { type: "started"; requestId: string }
  | { type: "progress"; progress: AssistantProgress }
  | { type: "activity"; activity: AssistantActivity }
  /** Provisional text belongs to the work log until the step finishes. */
  | { type: "text-delta"; delta: string; reset: boolean; provisional?: boolean }
  | {
      type: "answer";
      data: {
        /** Final answer only; intermediate public notes live in activity. */
        content: string;
        activity?: AssistantActivity[];
        truncated: boolean;
        summary: AssistantTurnSummary;
        conversation?: import("./assistant-history.js").AssistantConversationReceipt;
        selections?: AssistantSelection[];
        proposals?: AssistantFilterProposal[];
        pluginResults?: AssistantPluginResult[];
        connectionWrites?: import("./connections.js").ConnectionWriteProposal[];
      };
    }
  | {
      type: "error";
      code: string;
      message: string;
      summary?: AssistantTurnSummary;
      activity?: AssistantActivity[];
      conversation?: import("./assistant-history.js").AssistantConversationReceipt;
    };
