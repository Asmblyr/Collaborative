import type { Knex } from "knex";
import type {
  AssistantSkillAudience,
  AssistantSkillChannel,
  AssistantSkillDetail,
  AssistantSkillRelatedTerm,
  AssistantSkillScope,
  AssistantSkillStatus,
  AssistantSkillSummary,
} from "@asmblyr-collaborative/contracts";
import { grantFor, type Access } from "../permissions/access.js";
import { availableTerms } from "../terms/filters.js";
import { collectionData } from "../tools/collection-data.js";
import { isValidSkillSlug, normalizeSearch } from "./validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SkillVisibilityCandidate {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  examples: string[];
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  status: AssistantSkillStatus;
  exposeToMcp: boolean;
  collections: {
    id: string;
    name: string;
    mcpEnabled: boolean;
  }[];
  policyIds: string[];
  updatedAt: string;
}

export interface ListVisibleSkillsOptions {
  channel: AssistantSkillChannel;
  collection?: string | null;
  workspaceId?: string | null;
  workspace?: string | null;
  q?: string | null;
  limit?: number;
}

export interface ReadVisibleSkillOptions {
  channel: AssistantSkillChannel;
}

export interface DescribedCollectionSkill {
  slug: string;
  title: string;
  description: string;
}

export function isSkillVisible(
  skill: Pick<
    SkillVisibilityCandidate,
    | "status"
    | "exposeToMcp"
    | "scope"
    | "audience"
    | "collections"
    | "policyIds"
  >,
  access: Access,
  principalPolicyIds: ReadonlySet<string>,
  channel: AssistantSkillChannel,
): boolean {
  if (skill.status !== "active") {
    return false;
  }
  if (channel === "mcp" && !skill.exposeToMcp) {
    return false;
  }

  // Layer 1: Collection read-access & cascade safety.
  if (skill.scope === "collections") {
    if (skill.collections.length === 0) {
      return false;
    }
    for (const collection of skill.collections) {
      if (collection.name.startsWith("asmblyr_")) {
        return false;
      }
      if (grantFor(access, collection.name, "read") === null) {
        return false;
      }
    }
  }

  // Layer 2: Policy audience intersection.
  if (skill.audience === "policies" && !access.principal.superuser) {
    if (skill.policyIds.length === 0) {
      return false;
    }
    const intersects = skill.policyIds.some((policyId) =>
      principalPolicyIds.has(policyId.toLowerCase()),
    );
    if (!intersects) {
      return false;
    }
  }

  return true;
}

export function matchesSkillSearch(
  skill: Pick<
    AssistantSkillSummary,
    "slug" | "title" | "description" | "examples" | "collections"
  >,
  query: string | null | undefined,
): boolean {
  if (!query) {
    return true;
  }
  const needle = normalizeSearch(query);
  if (!needle) {
    return true;
  }
  if (normalizeSearch(skill.slug).includes(needle)) return true;
  if (normalizeSearch(skill.title).includes(needle)) return true;
  if (normalizeSearch(skill.description).includes(needle)) return true;
  if (
    skill.examples.some((example) => normalizeSearch(example).includes(needle))
  ) {
    return true;
  }
  if (
    skill.collections.some((collection) =>
      normalizeSearch(collection).includes(needle),
    )
  ) {
    return true;
  }
  return false;
}

export function formatSkillMarkdown(detail: AssistantSkillDetail): string {
  const lines: string[] = [
    "---",
    `slug: ${JSON.stringify(detail.slug)}`,
    `title: ${JSON.stringify(detail.title)}`,
    `description: ${JSON.stringify(detail.description)}`,
    `scope: ${JSON.stringify(detail.scope)}`,
  ];
  if (detail.collections.length === 0) {
    lines.push("collections: []");
  } else {
    lines.push("collections:");
    for (const collection of detail.collections) {
      lines.push(`  - ${JSON.stringify(collection)}`);
    }
  }
  lines.push(`expose_to_mcp: ${detail.exposeToMcp ? "true" : "false"}`);
  lines.push(`updated_at: ${JSON.stringify(detail.updatedAt)}`);
  lines.push("---", "", `# ${detail.title}`, "", detail.instructions.trim());

  if (detail.examples.length > 0) {
    lines.push("", "## Примеры запросов", "");
    for (const example of detail.examples) {
      lines.push(`- ${example}`);
    }
  }

  if (detail.relatedTerms.length > 0) {
    lines.push("", "## Связанные термины словаря", "");
    for (const term of detail.relatedTerms) {
      const aliases = term.aliases.length
        ? ` (синонимы: ${term.aliases.join(", ")})`
        : "";
      lines.push(
        `- **${term.name}** (\`${term.collection}\`)${aliases}: ${term.description}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function parseStoredExamples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function loadPrincipalPolicyIds(
  db: Knex,
  access: Access,
): Promise<Set<string>> {
  if (access.principal.superuser) {
    return new Set();
  }
  const table =
    access.principal.kind === "service"
      ? "public.asmblyr_service_policies"
      : "public.asmblyr_user_policies";
  const column = access.principal.kind === "service" ? "service_id" : "user_id";
  const rows = await db(table)
    .where({ [column]: access.principal.id })
    .pluck<string[]>("policy_id");
  return new Set(rows.map((id) => id.toLowerCase()));
}

async function loadActiveSkillCandidates(
  db: Knex,
  channel: AssistantSkillChannel,
  slug?: string,
): Promise<SkillVisibilityCandidate[]> {
  const skillQuery = db("public.asmblyr_assistant_skills")
    .where({ status: "active" })
    .select<
      {
        id: string;
        slug: string;
        title: string;
        description: string;
        instructions: string;
        examples: unknown;
        scope: AssistantSkillScope;
        audience: AssistantSkillAudience;
        status: AssistantSkillStatus;
        expose_to_mcp: boolean;
        updated_at: Date | string;
      }[]
    >("id", "slug", "title", "description", "instructions", "examples", "scope", "audience", "status", "expose_to_mcp", "updated_at");
  if (channel === "mcp") {
    skillQuery.where({ expose_to_mcp: true });
  }
  if (slug !== undefined) {
    skillQuery.whereRaw("lower(slug) = lower(?)", [slug]);
  }
  const rows = await skillQuery.orderBy("title", "asc").orderBy("slug", "asc");
  if (rows.length === 0) {
    return [];
  }
  const skillIds = rows.map((row) => row.id);
  const [collectionLinks, policyLinks] = await Promise.all([
    db("public.asmblyr_assistant_skill_collections as link")
      .join(
        "public.asmblyr_collections as collection",
        "collection.id",
        "link.collection_id",
      )
      .whereIn("link.skill_id", skillIds)
      .select<
        {
          skill_id: string;
          collection_id: string;
          name: string;
          mcp_enabled: boolean;
        }[]
      >(
        "link.skill_id",
        "collection.id as collection_id",
        "collection.name",
        "collection.mcp_enabled",
      )
      .orderBy("collection.name", "asc"),
    db("public.asmblyr_assistant_skill_policies")
      .whereIn("skill_id", skillIds)
      .select<
        { skill_id: string; policy_id: string }[]
      >("skill_id", "policy_id"),
  ]);

  const collectionsBySkill = new Map<
    string,
    { id: string; name: string; mcpEnabled: boolean }[]
  >();
  for (const link of collectionLinks) {
    const list = collectionsBySkill.get(link.skill_id) ?? [];
    list.push({
      id: link.collection_id,
      name: link.name,
      mcpEnabled: link.mcp_enabled,
    });
    collectionsBySkill.set(link.skill_id, list);
  }

  const policiesBySkill = new Map<string, string[]>();
  for (const link of policyLinks) {
    const list = policiesBySkill.get(link.skill_id) ?? [];
    list.push(link.policy_id.toLowerCase());
    policiesBySkill.set(link.skill_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    examples: parseStoredExamples(row.examples),
    scope: row.scope,
    audience: row.audience,
    status: row.status,
    exposeToMcp: row.expose_to_mcp,
    collections: collectionsBySkill.get(row.id) ?? [],
    policyIds: policiesBySkill.get(row.id) ?? [],
    updatedAt: toIsoString(row.updated_at),
  }));
}

async function resolveWorkspaceCollections(
  db: Knex,
  workspaceRef: string,
): Promise<Set<string> | null> {
  const trimmed = workspaceRef.trim();
  if (!trimmed) {
    return null;
  }
  let workspace: { id: string } | undefined;
  if (UUID_PATTERN.test(trimmed)) {
    workspace = await db("public.asmblyr_workspaces")
      .where({ id: trimmed.toLowerCase() })
      .first<{ id: string }>("id");
  } else {
    const all = await db("public.asmblyr_workspaces").select<
      { id: string; name: string }[]
    >("id", "name");
    const target = normalizeSearch(trimmed);
    workspace = all.find((item) => normalizeSearch(item.name) === target);
  }
  if (!workspace) {
    return new Set();
  }
  const rows = await db("public.asmblyr_workspace_collections as link")
    .join(
      "public.asmblyr_collections as collection",
      "collection.id",
      "link.collection_id",
    )
    .where("link.workspace_id", workspace.id)
    .pluck<string[]>("collection.name");
  return new Set(rows);
}

function toSummary(skill: SkillVisibilityCandidate): AssistantSkillSummary {
  return {
    slug: skill.slug,
    title: skill.title,
    description: skill.description,
    examples: skill.examples,
    scope: skill.scope,
    collections: skill.collections.map((collection) => collection.name),
    exposeToMcp: skill.exposeToMcp,
    updatedAt: skill.updatedAt,
  };
}

export async function listVisibleSkills(
  db: Knex,
  access: Access,
  options: ListVisibleSkillsOptions,
): Promise<AssistantSkillSummary[]> {
  const [candidates, principalPolicyIds] = await Promise.all([
    loadActiveSkillCandidates(db, options.channel),
    loadPrincipalPolicyIds(db, access),
  ]);

  const workspaceRef = options.workspaceId ?? options.workspace ?? null;
  const workspaceCollections = workspaceRef
    ? await resolveWorkspaceCollections(db, workspaceRef)
    : null;
  const collectionFilter = options.collection?.trim() || null;

  const visible = candidates
    .filter((skill) =>
      isSkillVisible(skill, access, principalPolicyIds, options.channel),
    )
    .map(toSummary)
    .filter((summary) => {
      if (collectionFilter) {
        if (
          summary.scope === "collections" &&
          !summary.collections.includes(collectionFilter)
        ) {
          return false;
        }
      }
      if (workspaceCollections) {
        if (
          summary.scope === "collections" &&
          !summary.collections.some((name) => workspaceCollections.has(name))
        ) {
          return false;
        }
      }
      return matchesSkillSearch(summary, options.q);
    });

  visible.sort((a, b) => {
    if (collectionFilter) {
      const aDirect = a.collections.includes(collectionFilter) ? 0 : 1;
      const bDirect = b.collections.includes(collectionFilter) ? 0 : 1;
      if (aDirect !== bDirect) return aDirect - bDirect;
    }
    const titleOrder = normalizeSearch(a.title).localeCompare(
      normalizeSearch(b.title),
      "ru",
    );
    if (titleOrder !== 0) return titleOrder;
    return a.slug.localeCompare(b.slug);
  });

  const limit =
    options.limit !== undefined
      ? Math.max(1, Math.min(100, Math.floor(options.limit)))
      : 50;
  return visible.slice(0, limit);
}

export async function readVisibleSkill(
  db: Knex,
  access: Access,
  slug: string,
  options: ReadVisibleSkillOptions,
): Promise<AssistantSkillDetail | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!isValidSkillSlug(normalizedSlug)) {
    return null;
  }
  const [candidates, principalPolicyIds] = await Promise.all([
    loadActiveSkillCandidates(db, options.channel, normalizedSlug),
    loadPrincipalPolicyIds(db, access),
  ]);
  const candidate = candidates[0];
  if (
    !candidate ||
    !isSkillVisible(candidate, access, principalPolicyIds, options.channel)
  ) {
    return null;
  }

  const relatedTerms: AssistantSkillRelatedTerm[] = [];
  if (candidate.scope === "collections") {
    for (const collection of candidate.collections) {
      if (!collection.mcpEnabled) {
        continue;
      }
      try {
        const data = await collectionData(db, access, collection.name);
        const terms = await availableTerms(db, collection.name, data, access);
        for (const term of terms) {
          relatedTerms.push({
            collection: collection.name,
            id: term.id,
            name: term.name,
            description: term.description,
            aliases: term.aliases,
            filter: term.filter,
          });
        }
      } catch {
        // Never leak terms from inaccessible or MCP-disabled collections.
      }
    }
  }

  return {
    ...toSummary(candidate),
    instructions: candidate.instructions,
    relatedTerms,
  };
}

export async function describeCollectionSkills(
  db: Knex,
  collectionId: string,
  access: Access,
  options: ReadVisibleSkillOptions,
): Promise<{
  skills: DescribedCollectionSkill[];
  skillsPartial: boolean;
}> {
  const [candidates, principalPolicyIds] = await Promise.all([
    loadActiveSkillCandidates(db, options.channel),
    loadPrincipalPolicyIds(db, access),
  ]);
  const matching = candidates.filter(
    (candidate) =>
      candidate.scope === "collections" &&
      candidate.collections.some(
        (collection) => collection.id === collectionId,
      ) &&
      isSkillVisible(candidate, access, principalPolicyIds, options.channel),
  );
  const skills: DescribedCollectionSkill[] = [];
  let size = 0;
  for (const skill of matching) {
    if (skills.length >= 20) break;
    const entry: DescribedCollectionSkill = {
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
    };
    const length = JSON.stringify(entry).length;
    if (size + length > 6_000) continue;
    skills.push(entry);
    size += length;
  }
  return {
    skills,
    skillsPartial: skills.length < matching.length,
  };
}
