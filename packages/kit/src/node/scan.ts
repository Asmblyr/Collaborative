import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  assertUniqueRoutes,
  routesForFile,
  type ApiRouteFile,
} from "./route-files.js";

export type { ApiRouteFile } from "./route-files.js";
export { scanCollectionFiles, parsePluginNamespace } from "./collections.js";
export { scanMigrationFiles, migrationNamePattern } from "./migrations.js";
export { scanHookFiles } from "./hooks.js";
export { generateUiRegistry } from "./ui-registry.js";
export { isLocalPluginPackage } from "./local-package.js";
export { sourceModelDefinitions } from "./model-generation.js";

/** Missing server/api is valid for plugins that have no HTTP handlers. */
export async function scanApiRoutes(
  directory: string,
): Promise<ApiRouteFile[]> {
  const routes: ApiRouteFile[] = [];

  async function visit(relative: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(path.join(directory, relative), {
        withFileTypes: true,
      });
    } catch (error) {
      if (
        relative === "" &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are not supported in server/api/${file}`);
      }
      if (entry.isDirectory()) {
        await visit(file);
      } else if (entry.isFile()) {
        routes.push(...routesForFile(file));
      }
    }
  }

  await visit("");
  assertUniqueRoutes(routes);
  return routes;
}
