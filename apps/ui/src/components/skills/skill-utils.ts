import type {
  AssistantSkill,
  AssistantSkillAdminMeta,
  AssistantSkillAudience,
  AssistantSkillInput,
  AssistantSkillScope,
  AssistantSkillStatus,
} from "@asmblyr-collaborative/contracts";

export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const MAX_SKILLS = 200;
export const MAX_SKILL_TITLE_LENGTH = 120;
export const MAX_SKILL_DESCRIPTION_LENGTH = 500;
export const MAX_SKILL_INSTRUCTIONS_LENGTH = 12_000;
export const MAX_SKILL_EXAMPLES = 5;
export const MAX_SKILL_EXAMPLE_LENGTH = 200;

export type SkillStatusFilter = "all" | "active" | "draft";
export type SkillMcpFilter = "all" | "mcp";

export interface SkillFormValues {
  title: string;
  slug: string;
  description: string;
  instructions: string;
  examples: string[];
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  status: AssistantSkillStatus;
  exposeToMcp: boolean;
  collections: string[];
  policyIds: string[];
}

const CYRILLIC_TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function normalizeSkillSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function isValidSkillSlug(value: string): boolean {
  return SKILL_SLUG_PATTERN.test(value.trim());
}

export function suggestSkillSlug(title: string): string {
  const lower = title.trim().toLocaleLowerCase("ru");
  let transliterated = "";
  for (const char of lower) {
    if (Object.hasOwn(CYRILLIC_TRANSLIT, char)) {
      transliterated += CYRILLIC_TRANSLIT[char];
    } else {
      transliterated += char;
    }
  }
  return transliterated
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/-+$/, "")
    .slice(0, 64);
}

export function filterSkills(
  skills: readonly AssistantSkill[],
  filters: {
    query: string;
    status: SkillStatusFilter;
    mcp: SkillMcpFilter;
  },
): AssistantSkill[] {
  const needle = normalizeSkillSearch(filters.query);
  return skills.filter((skill) => {
    if (filters.status !== "all" && skill.status !== filters.status) {
      return false;
    }
    if (filters.mcp === "mcp" && !skill.exposeToMcp) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = normalizeSkillSearch(
      [
        skill.title,
        skill.slug,
        `/${skill.slug}`,
        skill.description,
        ...skill.examples,
        ...skill.collectionDetails.flatMap((c) => [c.displayName, c.name]),
        ...skill.policies.map((p) => p.name),
      ].join(" "),
    );
    return haystack.includes(needle);
  });
}

export function sortSkills(
  skills: readonly AssistantSkill[],
): AssistantSkill[] {
  return [...skills].sort((a, b) => {
    const timeDiff =
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.slug.localeCompare(b.slug);
  });
}

export function createInitialSkillValues(
  skill: AssistantSkill | null,
  meta: AssistantSkillAdminMeta,
): SkillFormValues {
  if (skill) {
    return {
      title: skill.title,
      slug: skill.slug,
      description: skill.description,
      instructions: skill.instructions,
      examples: [...skill.examples],
      scope: skill.scope,
      audience: skill.audience,
      status: skill.status,
      exposeToMcp: skill.exposeToMcp,
      collections: [...skill.collections],
      policyIds: [...skill.policyIds],
    };
  }
  return {
    title: "",
    slug: "",
    description: "",
    instructions: "",
    examples: [],
    scope: meta.canUseGlobalScope ? "global" : "collections",
    audience: meta.canUseAllAudience ? "all" : "policies",
    status: "draft",
    exposeToMcp: false,
    collections: [],
    policyIds:
      !meta.canUseAllAudience && meta.delegatablePolicyIds.length === 1
        ? [meta.delegatablePolicyIds[0]]
        : [],
  };
}

export function toSkillInput(values: SkillFormValues): AssistantSkillInput {
  return {
    title: values.title.trim(),
    slug: values.slug.trim(),
    description: values.description.trim(),
    instructions: values.instructions.trim(),
    examples: values.examples.map((item) => item.trim()).filter(Boolean),
    scope: values.scope,
    audience: values.audience,
    status: values.status,
    exposeToMcp: values.exposeToMcp,
    collections: values.scope === "collections" ? values.collections : [],
    policyIds: values.audience === "policies" ? values.policyIds : [],
  };
}

export function canSubmitSkillValues(values: SkillFormValues): boolean {
  const title = values.title.trim();
  const slug = values.slug.trim();
  const description = values.description.trim();
  const instructions = values.instructions.trim();
  if (
    !title ||
    title.length > MAX_SKILL_TITLE_LENGTH ||
    !isValidSkillSlug(slug) ||
    !description ||
    description.length > MAX_SKILL_DESCRIPTION_LENGTH ||
    !instructions ||
    instructions.length > MAX_SKILL_INSTRUCTIONS_LENGTH
  ) {
    return false;
  }
  if (values.scope === "collections" && values.collections.length === 0) {
    return false;
  }
  if (values.audience === "policies" && values.policyIds.length === 0) {
    return false;
  }
  if (
    values.examples.length > MAX_SKILL_EXAMPLES ||
    values.examples.some(
      (item) => item.trim().length > MAX_SKILL_EXAMPLE_LENGTH,
    )
  ) {
    return false;
  }
  return true;
}
