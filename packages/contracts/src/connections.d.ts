export interface PersonalConnectionStatus {
  provider: "google";
  enabled: boolean;
  unavailable: boolean;
  connected: boolean;
  reconnect: boolean;
  email: string | null;
  connectedAt: string | null;
}
export interface ConnectionWriteProposal {
  id: string;
  provider: "google";
  operation:
    | "create_text"
    | "update_text"
    | "rename_file"
    | "trash_file"
    | "create_sheet"
    | "update_cells"
    | "append_cells";
  target: string;
  title: string;
  content: string;
  expiresAt: string;
}

export type ConnectionWriteStatus =
  | "pending"
  | "executing"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "uncertain";

/** A bounded receipt; Google response bodies and credentials are not retained. */
export interface ConnectionWriteResult {
  url: string | null;
  updatedCells: number | null;
  updatedRows: number | null;
  range: string | null;
}

export interface ConnectionWriteDetail extends ConnectionWriteProposal {
  status: ConnectionWriteStatus;
  /** Existing target, also available when a write outcome is unknown. */
  url: string | null;
  result: ConnectionWriteResult | null;
  failure: "target_changed" | null;
}
