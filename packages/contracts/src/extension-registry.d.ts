export interface ExtensionEntry {
  id: string;
  packageName: string;
  namespace: string | null;
  title: string;
  description: string | null;
  category: string | null;
  publisher: { id: string; name: string } | null;
  version: string;
  latestAvailableVersion: string | null;
  manifestVersion: 1;
  status:
    | "healthy"
    | "disabled"
    | "restart_required"
    | "incompatible"
    | "failed";
  /** The state requested in PostgreSQL. */
  desiredState: "enabled" | "disabled";
  /** State in the Core process that served this response. */
  actualState: "enabled" | "disabled" | "failed";
  instanceId: string;
  pendingRestart: boolean;
  lastError: string | null;
  loaded: boolean;
  desiredEnabled: boolean;
  restartRequired: boolean;
  compatible: boolean;
  issues: string[];
  capabilities: string[];
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  compatibility: {
    collaborative: string;
    node?: string;
  } | null;
  actions: { enable: boolean; disable: boolean; configure: boolean };
}

export interface ExtensionHistoryEntry {
  id: string;
  package_name: string;
  action: "enable" | "disable" | "startup" | "validation";
  result: "restart_required" | "blocked" | "succeeded" | "failed";
  error_code: string | null;
  error_message: string | null;
  actor_id: string | null;
  instance_id: string | null;
  created_at: string;
}

export interface ExtensionListResult {
  data: ExtensionEntry[];
  page: number;
  limit: number;
  total: number;
}
