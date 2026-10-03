import { lstat, readdir } from "node:fs/promises";

/** Hooks are declarations, not HTTP routes. Stable filename order defines execution order. */
export async function scanHookFiles(directory: string): Promise<string[]> {
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (!info) {
    return [];
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("server/hooks must be a directory, not a symlink");
  }
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      throw new Error("Place hooks directly in server/hooks, without symlinks");
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
      continue;
    }
    if (
      entry.name.includes("..") ||
      !/^[a-z0-9][a-z0-9._-]*\.ts$/.test(entry.name)
    ) {
      throw new Error(`Invalid hook filename: ${entry.name}`);
    }
    files.push(entry.name);
  }
  return files.sort();
}
