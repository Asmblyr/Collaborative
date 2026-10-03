import { cache } from "react";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { coreAddress } from "./session";

export const loadCollections = cache(async (token: string): Promise<{
  data: Collection[];
  folders: CollectionFolder[];
  online: boolean;
}> => {
  try {
    const response = await fetch(coreAddress("/collections"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { data: [], folders: [], online: false };
    const result = await response.json() as { data: Collection[]; folders: CollectionFolder[] };
    return { data: result.data, folders: result.folders, online: true };
  } catch {
    return { data: [], folders: [], online: false };
  }
});
