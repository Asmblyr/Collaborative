import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EndpointDefinition } from "@asmblyr/kit";
import { bindModelDefinition } from "@asmblyr/kit";
import type { ModelDefinition } from "@asmblyr/kit/model";
import { scanApiRoutes, sourceModelDefinitions } from "@asmblyr/kit/node";
import { isRecord, parseEndpoint, parseEndpointAddress } from "./definition.js";

export interface PendingEndpoint {
  method: EndpointDefinition["method"];
  path: string;
  url: URL;
  model?: ModelDefinition;
}

export async function sourceEndpoints(
  packageRoot: string,
): Promise<PendingEndpoint[]> {
  const directory = path.join(packageRoot, "server/api");
  const routes = await scanApiRoutes(directory);
  const models = await sourceModelDefinitions(packageRoot, routes);
  return routes.map((route) => ({
    method: route.method,
    path: route.path,
    url: pathToFileURL(path.join(directory, route.file)),
    model: models.get(route.file),
  }));
}

export async function builtEndpoints(
  index: URL,
  name: string,
): Promise<PendingEndpoint[]> {
  const value: unknown = JSON.parse(await readFile(index, "utf8"));
  if (!Array.isArray(value))
    throw new Error(`Plugin ${name}: invalid route index`);
  const routes: PendingEndpoint[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      Object.keys(entry).some(
        (key) => !["method", "path", "file", "model"].includes(key),
      ) ||
      typeof entry.file !== "string" ||
      !/^\.\/server\/api\/[a-zA-Z0-9_\-/\[\].]+\.js$/.test(entry.file) ||
      entry.file
        .slice(2)
        .split("/")
        .some((part) => part === "." || part === ".." || part === "")
    ) {
      throw new Error(`Plugin ${name}: invalid compiled handler path`);
    }
    const endpoint = parseEndpointAddress(entry, name);
    const url = new URL(entry.file, index);
    await access(url);
    if (
      entry.model !== undefined &&
      (!isRecord(entry.model) ||
        typeof entry.model.id !== "string" ||
        !isRecord(entry.model.inputSchema) ||
        !isRecord(entry.model.outputSchema))
    ) {
      throw new Error(`Plugin ${name}: invalid compiled model definition`);
    }
    routes.push({
      method: endpoint.method,
      path: endpoint.path,
      url,
      model: entry.model as ModelDefinition | undefined,
    });
  }
  return routes;
}

export async function importEndpoints(
  routes: readonly PendingEndpoint[],
  name: string,
): Promise<EndpointDefinition[]> {
  const endpoints: EndpointDefinition[] = [];
  for (const route of routes) {
    const module: { default?: unknown } = await import(route.url.href);
    const endpoint = parseEndpoint(
      { method: route.method, path: route.path, handler: module.default },
      `${name} (${route.url.pathname})`,
    );
    if (route.model) bindModelDefinition(endpoint.handler, route.model);
    if (endpoint.handler.meta?.asmblyrModel && !route.model) {
      throw new Error(
        `Plugin ${name}: model schema is missing; rebuild the plugin`,
      );
    }
    endpoints.push(endpoint);
  }
  return endpoints;
}
