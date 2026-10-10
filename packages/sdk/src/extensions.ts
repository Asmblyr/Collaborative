import type {
  ExtensionEntry,
  ExtensionHistoryEntry,
  ExtensionListResult,
} from "@asmblyr-collaborative/contracts";
import type { RequestOptions } from "./options.js";
import type { Transport } from "./transport.js";

export interface ExtensionListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExtensionEntry["status"];
  category?: string;
  sort?: "title" | "version" | "status";
}

export interface ExtensionsClient {
  list(
    options?: ExtensionListOptions,
    request?: RequestOptions,
  ): Promise<ExtensionListResult>;
  get(id: string, request?: RequestOptions): Promise<{ data: ExtensionEntry }>;
  versions(
    id: string,
    request?: RequestOptions,
  ): Promise<{
    data: { version: string; source: "project-package"; installed: true }[];
  }>;
  dependencies(
    id: string,
    request?: RequestOptions,
  ): Promise<{
    data: {
      required: Record<string, string>;
      optional: Record<string, string>;
    };
  }>;
  permissions(
    id: string,
    request?: RequestOptions,
  ): Promise<{ data: { declared: string[]; approvalIssue: string | null } }>;
  health(
    id: string,
    request?: RequestOptions,
  ): Promise<{
    data: {
      status: ExtensionEntry["status"];
      issues: string[];
      restartRequired: boolean;
      desiredState: ExtensionEntry["desiredState"];
      actualState: ExtensionEntry["actualState"];
      pendingRestart: boolean;
      lastError: string | null;
      instanceId: string;
    };
  }>;
  history(
    id: string,
    request?: RequestOptions,
  ): Promise<{ data: ExtensionHistoryEntry[] }>;
  enable(
    id: string,
    request?: RequestOptions,
  ): Promise<{ data: ExtensionEntry & { changed: boolean } }>;
  disable(
    id: string,
    request?: RequestOptions,
  ): Promise<{ data: ExtensionEntry & { changed: boolean } }>;
}

export function createExtensionsClient(transport: Transport): ExtensionsClient {
  const base = "/settings/extension-registry";
  const path = (id: string) => `${base}/${encodeURIComponent(id)}`;
  return {
    list(options = {}, request) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
          query.set(key, String(value));
        }
      }
      return transport.get(base, query, request);
    },
    get: (id, request) => transport.get(path(id), undefined, request),
    versions: (id, request) =>
      transport.get(`${path(id)}/versions`, undefined, request),
    dependencies: (id, request) =>
      transport.get(`${path(id)}/dependencies`, undefined, request),
    permissions: (id, request) =>
      transport.get(`${path(id)}/permissions`, undefined, request),
    health: (id, request) =>
      transport.get(`${path(id)}/health`, undefined, request),
    history: (id, request) =>
      transport.get(`${path(id)}/history`, undefined, request),
    enable: (id, request) =>
      transport.write("POST", `${path(id)}/enable`, undefined, request),
    disable: (id, request) =>
      transport.write("POST", `${path(id)}/disable`, undefined, request),
  };
}
