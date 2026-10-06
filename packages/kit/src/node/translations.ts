import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { TranslationCatalogs } from "@asmblyr-collaborative/contracts";
import { uiLocales } from "@asmblyr-collaborative/contracts";

/** Optional flat JSON catalogs live next to package.json in source and published packages. */
export async function readPluginTranslations(
  directory: string,
): Promise<TranslationCatalogs> {
  const catalogs: TranslationCatalogs = {};
  for (const locale of uiLocales) {
    const file = path.join(directory, "locales", `${locale}.json`);
    let resolved: string;
    try {
      resolved = await realpath(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
    const root = await realpath(directory);
    const relative = path.relative(root, resolved);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      (await stat(resolved)).size > 256 * 1024
    ) {
      throw new Error(
        "Plugin translation catalog must be inside its package and below 256 KiB",
      );
    }
    const messages: unknown = JSON.parse(await readFile(resolved, "utf8"));
    if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
      throw new Error("Plugin translations must be flat JSON objects");
    }
    for (const [key, value] of Object.entries(messages)) {
      if (
        !/^[a-zA-Z0-9_.-]{1,160}$/.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key) ||
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 4000 ||
        value.includes("\0")
      ) {
        throw new Error(`Invalid plugin translation: ${locale}/${key}`);
      }
    }
    catalogs[locale] = messages as Record<string, string>;
  }
  return catalogs;
}
