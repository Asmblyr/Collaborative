import { access, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scanHookFiles } from "@asmblyr/kit/node";
import type { HookDefinition } from "@asmblyr/kit";
import { isRecord } from "./definition.js";
import { parseSettingsDefinition } from "./settings-validation.js";

export interface PendingHook {
  id: string;
  url: URL;
}
export interface LoadedHook {
  id: string;
  definition: HookDefinition;
}

export async function sourceHooks(root: string): Promise<PendingHook[]> {
  const files = await scanHookFiles(path.join(root, "server/hooks"));
  return files.map((file) => ({
    id: file.slice(0, -3),
    url: pathToFileURL(path.join(root, "server/hooks", file)),
  }));
}

export async function builtHooks(index: URL): Promise<PendingHook[]> {
  const files: unknown = JSON.parse(await readFile(index, "utf8"));
  if (!Array.isArray(files)) {
    throw new Error("Invalid plugin hooks index");
  }
  const entries: PendingHook[] = [];
  const ids = new Set<string>();
  for (const file of files) {
    const match =
      typeof file === "string" &&
      /^\.\/server\/hooks\/([a-z0-9][a-z0-9._-]*)\.js$/.exec(file);
    if (!match || match[1].includes("..") || ids.has(match[1])) {
      throw new Error("Invalid or duplicate compiled hook path");
    }
    ids.add(match[1]);
    const url = new URL(file, index);
    await access(url);
    entries.push({ id: match[1], url });
  }
  return entries.sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
}

export function parseHookDefinition(value: unknown): HookDefinition {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["event", "handle"].includes(key)) ||
    ![
      "items.create",
      "items.update",
      "items.delete",
      "collections.delete",
    ].includes(String(value.event)) ||
    typeof value.handle !== "function"
  ) {
    throw new Error("Expected defineHook(event, handler)");
  }
  return value as HookDefinition;
}

export async function importHooks(
  entries: PendingHook[],
): Promise<LoadedHook[]> {
  const result: LoadedHook[] = [];
  for (const entry of entries) {
    const module = await import(entry.url.href);
    result.push({
      id: entry.id,
      definition: parseHookDefinition(module.default),
    });
  }
  return result;
}

export async function sourceSettings(root: string): Promise<URL | undefined> {
  const url = pathToFileURL(path.join(root, "server/settings.ts"));
  const file = await lstat(url).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (!file) {
    return undefined;
  }
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error("Invalid server/settings.ts");
  }
  return url;
}

export async function importSettings(url: URL | undefined) {
  if (!url) {
    return undefined;
  }
  return parseSettingsDefinition((await import(url.href)).default);
}
