import type { EndpointDefinition } from "../endpoint.js";

export interface ApiRouteFile {
  method: EndpointDefinition["method"];
  path: string;
  /** Relative to the server/api directory, with forward slashes. */
  file: string;
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeSegment(segment: string, file: string): string {
  const parameter = /^\[([a-zA-Z][a-zA-Z0-9_]*)\]$/.exec(segment);
  if (parameter) return `:${parameter[1]}`;
  if (/^[a-zA-Z0-9_-]+$/.test(segment)) return segment;
  throw new Error(
    `Unsupported route segment "${segment}" in server/api/${file}`,
  );
}

export function routesForFile(file: string): ApiRouteFile[] {
  if (!file.endsWith(".ts") || file.endsWith(".d.ts")) return [];
  const segments = file.slice(0, -3).split("/");
  const leaf = segments.pop()!;
  const [name, suffix, ...extra] = leaf.split(".");
  const method = methods.find(
    (candidate) => candidate.toLowerCase() === suffix,
  );
  if (extra.length > 0 || (suffix !== undefined && !method)) {
    throw new Error(`Unsupported HTTP method suffix in server/api/${file}`);
  }
  if (name !== "index") segments.push(name);
  const parts = segments.map((segment) => routeSegment(segment, file));
  if (
    !parts.length ||
    !/^[a-z][a-z0-9-]*$/.test(parts[0]) ||
    parts[0] === "api"
  ) {
    throw new Error(
      `server/api/${file} needs a static namespace, such as comments/`,
    );
  }
  const parameters = parts.filter((part) => part.startsWith(":"));
  if (new Set(parameters).size !== parameters.length) {
    throw new Error(`Duplicate parameter name in server/api/${file}`);
  }
  return (method ? [method] : methods).map((verb) => ({
    method: verb,
    path: `/${parts.join("/")}`,
    file,
  }));
}

export function assertUniqueRoutes(routes: readonly ApiRouteFile[]): void {
  const owners = new Map<string, string>();
  for (const route of routes) {
    const shape = route.path.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g, ":param");
    const key = `${route.method} ${shape}`;
    const previous = owners.get(key);
    if (previous) {
      throw new Error(
        `Duplicate ${route.method} ${route.path}: ${previous} and ${route.file}`,
      );
    }
    owners.set(key, route.file);
  }
}
