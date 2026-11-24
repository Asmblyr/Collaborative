"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssistantSkillSummary } from "@asmblyr-collaborative/contracts";
import { apiRequest } from "@/lib/api-request";
import {
  buildAssistantSkillsUrl,
  groupAssistantSkills,
} from "./assistant-skills-state";

export {
  buildAssistantSkillsUrl,
  collectWelcomeSkillExamples,
  filterAndGroupSkills,
  groupAssistantSkills,
  isCollectionBoundSkill,
  matchesSkillQuery,
  normalizeSkillQuery,
  parseSlashSkillQuery,
  stripSlashSkillPrefix,
} from "./assistant-skills-state";

interface CacheEntry {
  expiresAt: number;
  data?: AssistantSkillSummary[];
  promise?: Promise<AssistantSkillSummary[]>;
}

const SKILLS_TTL_MS = 30_000;
const skillsCache = new Map<string, CacheEntry>();

function skillsCacheKey(
  collection?: string | null,
  workspaceId?: string | null,
): string {
  return `${collection?.trim() ?? ""}|${workspaceId?.trim() ?? ""}`;
}

function readSkills(
  collection?: string | null,
  workspaceId?: string | null,
  force = false,
): Promise<AssistantSkillSummary[]> {
  const key = skillsCacheKey(collection, workspaceId);
  const now = Date.now();
  if (!force) {
    const cached = skillsCache.get(key);
    if (cached?.data && cached.expiresAt > now) {
      return Promise.resolve(cached.data);
    }
    if (cached?.promise) {
      return cached.promise;
    }
  } else {
    skillsCache.delete(key);
  }

  const url = buildAssistantSkillsUrl(collection, workspaceId);
  const promise = apiRequest<AssistantSkillSummary[]>(url)
    .then((data) => {
      const items = Array.isArray(data) ? data : [];
      skillsCache.set(key, {
        data: items,
        expiresAt: Date.now() + SKILLS_TTL_MS,
      });
      return items;
    })
    .catch(() => {
      skillsCache.delete(key);
      return [];
    });

  skillsCache.set(key, {
    expiresAt: now + SKILLS_TTL_MS,
    promise,
  });
  return promise;
}

export function clearAssistantSkillsCache(): void {
  skillsCache.clear();
}

export interface UseAssistantSkillsResult {
  skills: AssistantSkillSummary[];
  collectionSkills: AssistantSkillSummary[];
  generalSkills: AssistantSkillSummary[];
  loading: boolean;
  reload: () => void;
}

export function useAssistantSkills({
  enabled,
  collection = null,
  workspaceId = null,
}: {
  enabled: boolean;
  collection?: string | null;
  workspaceId?: string | null;
}): UseAssistantSkillsResult {
  const key = skillsCacheKey(collection, workspaceId);
  const [state, setState] = useState<{
    key: string;
    skills: AssistantSkillSummary[];
    settledVersion: number;
  }>(() => {
    const cached = skillsCache.get(key);
    const cachedData =
      cached?.data && cached.expiresAt > Date.now() ? cached.data : null;
    return {
      key,
      skills: cachedData ?? [],
      settledVersion: cachedData ? 0 : -1,
    };
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    void readSkills(collection, workspaceId, version > 0).then((items) => {
      if (!active) {
        return;
      }
      setState({
        key,
        skills: items,
        settledVersion: version,
      });
    });
    return () => {
      active = false;
    };
  }, [enabled, collection, workspaceId, key, version]);

  const reload = useCallback(() => {
    skillsCache.delete(key);
    setVersion((previous) => previous + 1);
  }, [key]);

  const skills = useMemo(
    () => (state.key === key ? state.skills : []),
    [state.key, state.skills, key],
  );
  const loading =
    enabled && (state.key !== key || state.settledVersion !== version);

  const grouped = useMemo(
    () => groupAssistantSkills(skills, collection),
    [skills, collection],
  );

  return {
    skills,
    collectionSkills: grouped.collectionSkills,
    generalSkills: grouped.generalSkills,
    loading,
    reload,
  };
}
