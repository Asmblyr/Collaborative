import type {
  EndpointDefinition,
  PluginDefinition,
  PluginCapability,
} from "@asmblyr/kit";
import type { PluginCollection } from "./collection-definition.js";
import type { PluginMigration } from "./migration-index.js";
import type { PluginSettingsDefinition } from "@asmblyr/contracts";
import type { LoadedHook } from "./hook-index.js";

export interface LoadedPlugin {
  name: string;
  definition: PluginDefinition;
  endpoints: readonly EndpointDefinition[];
  namespace?: string;
  collections?: readonly PluginCollection[];
  migrations?: readonly PluginMigration[];
  hasUi?: boolean;
  hooks?: readonly LoadedHook[];
  settings?: PluginSettingsDefinition;
  /** Intersection approved at load time. Missing means no optional capabilities. */
  capabilities?: readonly PluginCapability[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const pathPattern =
  /^\/[a-z][a-z0-9-]*(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*$/;

export function parseEndpointAddress(
  value: Record<string, unknown>,
  name: string,
): Pick<EndpointDefinition, "method" | "path"> {
  const method = methods.find((candidate) => candidate === value.method);
  if (
    !method ||
    typeof value.path !== "string" ||
    !pathPattern.test(value.path)
  ) {
    throw new Error(`Plugin ${name}: invalid HTTP method or Core path`);
  }
  if (value.path.split("/")[1] === "api") {
    throw new Error(`Plugin ${name}: Core paths must not include /api`);
  }
  return { method, path: value.path };
}

export function parseEndpoint(
  value: unknown,
  name: string,
): EndpointDefinition {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !["method", "path", "handler"].includes(key),
    ) ||
    typeof value.handler !== "function"
  ) {
    throw new Error(
      `Plugin ${name}: invalid endpoint; expected method, Core path and handler`,
    );
  }
  return {
    ...parseEndpointAddress(value, name),
    handler: value.handler as EndpointDefinition["handler"],
  };
}

export function parsePluginDefinition(
  value: unknown,
  name: string,
): PluginDefinition {
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    throw new Error(
      `Plugin ${name}: expected definePlugin({}); handlers and action metadata belong in server/api`,
    );
  }
  return {};
}
