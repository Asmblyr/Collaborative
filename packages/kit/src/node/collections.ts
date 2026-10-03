import { lstat, readdir } from "node:fs/promises";

/** Missing declarations are valid for plugins that only provide handlers. */
export async function scanCollectionFiles(
  directory: string,
): Promise<string[]> {
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return [];
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("server/collections must be a directory, not a symlink");
  }
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.isDirectory()) {
      throw new Error(
        `Place declarations directly in server/collections: ${entry.name}`,
      );
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
    if (!/^[a-z][a-z0-9_]*\.ts$/.test(entry.name)) {
      throw new Error(`Invalid collection filename: ${entry.name}`);
    }
    files.push(entry.name);
  }
  return files.sort();
}

export function parsePluginNamespace(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !/^[a-z][a-z0-9_]{0,30}$/.test(value) ||
    value === "asmblyr" ||
    value.startsWith("asmblyr_") ||
    value.startsWith("plugin_")
  ) {
    throw new Error(
      "Plugin namespace must be 1–31 lowercase letters, digits or underscores, starting with a letter; asmblyr and plugin_ are reserved",
    );
  }
  return value;
}
