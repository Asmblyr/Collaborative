"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-request";
import type { Collection } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";

interface CacheEntry {
  expiresAt: number;
  data?: Collection[];
  promise?: Promise<Collection[]>;
}

const CATALOG_TTL_MS = 60_000;
const catalogCache = new Map<string, CacheEntry>();

function readCatalog(key: string): Promise<Collection[]> {
  const now = Date.now();
  const cached = catalogCache.get(key);
  if (cached?.data && cached.expiresAt > now) {
    return Promise.resolve(cached.data);
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = apiRequest<Collection[]>("/api/collections")
    .then((data) => {
      const items = Array.isArray(data) ? data : [];
      catalogCache.set(key, {
        data: items,
        expiresAt: Date.now() + CATALOG_TTL_MS,
      });
      return items;
    })
    .catch(() => {
      catalogCache.delete(key);
      return [];
    });

  catalogCache.set(key, {
    expiresAt: now + CATALOG_TTL_MS,
    promise,
  });
  return promise;
}

export function useAssistantCatalog(workspaceId: string | null): Collection[] {
  const key = workspaceId ?? "default";
  const [catalog, setCatalog] = useState<Collection[]>(() => {
    const cached = catalogCache.get(key);
    return cached?.data && cached.expiresAt > Date.now() ? cached.data : [];
  });

  useEffect(() => {
    let active = true;
    void readCatalog(key).then((items) => {
      if (active) {
        setCatalog(items);
      }
    });
    return () => {
      active = false;
    };
  }, [key]);

  return useLocalizedCatalog(catalog);
}
