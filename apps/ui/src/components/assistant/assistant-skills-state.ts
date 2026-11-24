import type {
  AssistantDataAccess,
  AssistantSkillSummary,
} from "@asmblyr-collaborative/contracts";
import { retryDataAccess, type PageContext } from "./assistant-context-types";
import type { AssistantSettings } from "./assistant-types";

export interface SendSnapshot {
  content: string;
  messageId: string;
  settings: AssistantSettings;
  context: PageContext | null;
  dataAccess?: AssistantDataAccess;
  skillSlug: string | null;
}

export interface GroupedAssistantSkills {
  collectionSkills: AssistantSkillSummary[];
  generalSkills: AssistantSkillSummary[];
  flatSkills: AssistantSkillSummary[];
}

export interface WelcomeSkillExample {
  skill: AssistantSkillSummary;
  prompt: string;
  isCollectionSkill: boolean;
}

export function normalizeSkillQuery(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/**
 * Parses a slash-command query at the start of the composer draft (e.g. "/" or "/proj").
 * Returns null once whitespace/newline appears or if draft does not start with "/".
 */
export function parseSlashSkillQuery(draft: string): string | null {
  const match = /^\/([^\s\n]*)$/.exec(draft);
  return match ? match[1] : null;
}

/**
 * Strips a leading `/query` token (and at most one trailing space/tab) from the draft
 * when attaching a skill from the slash menu. Preserves non-slash drafts untouched.
 */
export function stripSlashSkillPrefix(draft: string): string {
  if (!draft.startsWith("/")) {
    return draft;
  }
  return draft.replace(/^\/[^\s\n]*[ \t]?/, "");
}

export function matchesSkillQuery(
  skill: Pick<
    AssistantSkillSummary,
    "slug" | "title" | "description" | "examples" | "collections"
  >,
  query: string,
): boolean {
  const needle = normalizeSkillQuery(query);
  if (!needle) {
    return true;
  }
  if (normalizeSkillQuery(skill.slug).includes(needle)) {
    return true;
  }
  if (normalizeSkillQuery(skill.title).includes(needle)) {
    return true;
  }
  if (normalizeSkillQuery(skill.description).includes(needle)) {
    return true;
  }
  if (
    skill.examples.some((example) =>
      normalizeSkillQuery(example).includes(needle),
    )
  ) {
    return true;
  }
  if (
    skill.collections.some((collection) =>
      normalizeSkillQuery(collection).includes(needle),
    )
  ) {
    return true;
  }
  return false;
}

export function isCollectionBoundSkill(
  skill: Pick<AssistantSkillSummary, "scope" | "collections">,
  currentCollection?: string | null,
): boolean {
  const target = currentCollection?.trim();
  if (!target) {
    return false;
  }
  return skill.scope === "collections" && skill.collections.includes(target);
}

export function groupAssistantSkills(
  skills: readonly AssistantSkillSummary[],
  currentCollection?: string | null,
): GroupedAssistantSkills {
  const collectionSkills: AssistantSkillSummary[] = [];
  const generalSkills: AssistantSkillSummary[] = [];

  for (const skill of skills) {
    if (isCollectionBoundSkill(skill, currentCollection)) {
      collectionSkills.push(skill);
    } else {
      generalSkills.push(skill);
    }
  }

  return {
    collectionSkills,
    generalSkills,
    flatSkills: [...collectionSkills, ...generalSkills],
  };
}

export function filterAndGroupSkills(
  skills: readonly AssistantSkillSummary[],
  query: string,
  currentCollection?: string | null,
): GroupedAssistantSkills {
  const filtered = skills.filter((skill) => matchesSkillQuery(skill, query));
  return groupAssistantSkills(filtered, currentCollection);
}

/**
 * Surfaces up to `limit` starter examples from visible active skills,
 * prioritizing current collection's skills first and distributing fairly across skills.
 */
export function collectWelcomeSkillExamples(
  skills: readonly AssistantSkillSummary[],
  currentCollection?: string | null,
  limit = 6,
): WelcomeSkillExample[] {
  if (limit <= 0 || skills.length === 0) {
    return [];
  }
  const { collectionSkills, generalSkills } = groupAssistantSkills(
    skills,
    currentCollection,
  );
  const seen = new Set<string>();
  const collected: WelcomeSkillExample[] = [];

  const collectGroup = (
    group: readonly AssistantSkillSummary[],
    isCollectionSkill: boolean,
  ) => {
    const queues = group
      .map((skill) => ({
        skill,
        examples: skill.examples
          .map((example) => example.trim())
          .filter(Boolean),
      }))
      .filter((entry) => entry.examples.length > 0);

    let index = 0;
    while (collected.length < limit) {
      let progressed = false;
      for (const entry of queues) {
        if (collected.length >= limit) {
          break;
        }
        const prompt = entry.examples[index];
        if (!prompt) {
          continue;
        }
        progressed = true;
        const dedupeKey = `${entry.skill.slug}:${normalizeSkillQuery(prompt)}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        collected.push({
          skill: entry.skill,
          prompt,
          isCollectionSkill,
        });
      }
      if (!progressed) {
        break;
      }
      index += 1;
    }
  };

  collectGroup(collectionSkills, true);
  collectGroup(generalSkills, false);
  return collected;
}

export function buildAssistantSkillsUrl(
  collection?: string | null,
  workspaceId?: string | null,
): string {
  const params = new URLSearchParams();
  if (collection?.trim()) {
    params.set("collection", collection.trim());
  }
  if (workspaceId?.trim()) {
    params.set("workspaceId", workspaceId.trim());
  }
  const query = params.toString();
  return query ? `/api/assistant/skills?${query}` : "/api/assistant/skills";
}

export function createSendSnapshot(params: {
  content: string;
  messageId: string;
  settings: AssistantSettings;
  context: PageContext | null;
  dataAccess?: AssistantDataAccess;
  skillSlug?: string | null;
}): SendSnapshot {
  return structuredClone({
    content: params.content,
    messageId: params.messageId,
    settings: params.settings,
    context: params.context,
    ...(params.dataAccess ? { dataAccess: params.dataAccess } : {}),
    skillSlug: params.skillSlug ?? null,
  });
}

export function cloneRetrySnapshot(
  original: SendSnapshot,
  currentDataAccess?: AssistantDataAccess,
): SendSnapshot {
  return structuredClone({
    ...original,
    skillSlug: original.skillSlug ?? null,
    dataAccess: retryDataAccess(
      original.context,
      original.dataAccess,
      currentDataAccess,
    ),
  });
}
