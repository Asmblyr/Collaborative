import { cache } from "react";
import { coreAddress } from "./session";

/** Only packages enabled in Core may render in the UI. */
export const loadPluginExtensions = cache(async (token: string): Promise<string[]> => {
  const response = await fetch(coreAddress("/extensions"), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Не удалось загрузить расширения");
  const result = (await response.json()) as { data: { name: string }[] };
  return result.data.map((plugin) => plugin.name);
});
