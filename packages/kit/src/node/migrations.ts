import { lstat, readdir } from "node:fs/promises";

export const migrationNamePattern = /^\d{14}_[a-z][a-z0-9_]*$/;

export async function scanMigrationFiles(directory: string): Promise<string[]> {
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("server/migrations must be a directory, not a symlink");
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Place migration files directly in server/migrations");
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
    if (!migrationNamePattern.test(entry.name.slice(0, -3)))
      throw new Error(`Invalid migration filename: ${entry.name}; use YYYYMMDDHHmmss_name.ts`);
    files.push(entry.name);
  }
  return files.sort();
}
