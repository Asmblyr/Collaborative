import type {
  AssistantSkillAudience,
  AssistantSkillInput,
  AssistantSkillScope,
  AssistantSkillStatus,
} from "@asmblyr-collaborative/contracts";
import { parseCollectionName } from "../items/validation.js";
import { InputError, objectInput, textInput } from "../shared/input.js";

export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_MULTILINE_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const MAX_SKILLS = 200;
export const MAX_SKILL_TITLE_LENGTH = 120;
export const MAX_SKILL_DESCRIPTION_LENGTH = 500;
export const MAX_SKILL_INSTRUCTIONS_LENGTH = 12_000;
export const MAX_SKILL_EXAMPLES = 5;
export const MAX_SKILL_EXAMPLE_LENGTH = 200;
export const MAX_SKILL_COLLECTIONS = 50;
export const MAX_SKILL_POLICIES = 100;

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function isValidSkillSlug(value: string): boolean {
  return SKILL_SLUG_PATTERN.test(value);
}

export function parseSkillId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new InputError("Некорректный идентификатор умения");
  }
  return value.toLowerCase();
}

export function parseSkillSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new InputError(
      "Slug умения должен содержать 1–64 символа: строчные латинские буквы, цифры, дефис или подчёркивание",
    );
  }
  const slug = value.trim();
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new InputError(
      "Slug умения должен начинаться с латинской буквы или цифры и содержать только строчные латинские буквы, цифры, дефис или подчёркивание (1–64 символа)",
    );
  }
  return slug;
}

function parseMultilineText(
  value: unknown,
  maxLength: number,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new InputError(
      `${label} должно содержать от 1 до ${maxLength} символов`,
    );
  }
  const text = value.trim();
  if (
    !text ||
    text.length > maxLength ||
    FORBIDDEN_MULTILINE_CONTROL.test(value)
  ) {
    throw new InputError(
      `${label} должно содержать от 1 до ${maxLength} символов`,
    );
  }
  return text;
}

function parseScope(value: unknown): AssistantSkillScope {
  if (value !== "global" && value !== "collections") {
    throw new InputError("Область действия должна быть global или collections");
  }
  return value;
}

function parseAudience(value: unknown): AssistantSkillAudience {
  if (value !== "all" && value !== "policies") {
    throw new InputError("Аудитория должна быть all или policies");
  }
  return value;
}

function parseStatus(value: unknown): AssistantSkillStatus {
  if (value !== "draft" && value !== "active") {
    throw new InputError("Статус должен быть draft или active");
  }
  return value;
}

function parseExamples(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SKILL_EXAMPLES) {
    throw new InputError(
      `Укажите до ${MAX_SKILL_EXAMPLES} примеров запросов (каждый до ${MAX_SKILL_EXAMPLE_LENGTH} символов)`,
    );
  }
  return value.map((item) => textInput(item, MAX_SKILL_EXAMPLE_LENGTH));
}

function parseBoundCollections(
  value: unknown,
  scope: AssistantSkillScope,
): string[] {
  if (value === undefined && scope === "global") {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SKILL_COLLECTIONS) {
    throw new InputError(`Укажите до ${MAX_SKILL_COLLECTIONS} коллекций`);
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new InputError("Некорректное имя коллекции");
    }
    const name = item.trim();
    if (name.startsWith("asmblyr_")) {
      throw new InputError("Системные коллекции нельзя привязывать к умениям");
    }
    parseCollectionName(name);
    names.push(name);
  }
  const unique = [...new Set(names)];
  if (scope === "global") {
    return [];
  }
  if (!unique.length) {
    throw new InputError(
      "Для умения с привязкой к коллекциям выберите хотя бы одну коллекцию",
    );
  }
  return unique;
}

function parseBoundPolicies(
  value: unknown,
  audience: AssistantSkillAudience,
): string[] {
  if (value === undefined && audience === "all") {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_SKILL_POLICIES) {
    throw new InputError(`Укажите до ${MAX_SKILL_POLICIES} политик доступа`);
  }
  const ids = value.map((item) => {
    if (typeof item !== "string" || !UUID_PATTERN.test(item)) {
      throw new InputError("Некорректный идентификатор политики доступа");
    }
    return item.toLowerCase();
  });
  const unique = [...new Set(ids)];
  if (audience === "all") {
    return [];
  }
  if (!unique.length) {
    throw new InputError(
      "Для ограничения по политикам выберите хотя бы одну политику доступа",
    );
  }
  return unique;
}

export function parseSkillInput(value: unknown): AssistantSkillInput {
  const body = objectInput(value, [
    "slug",
    "title",
    "description",
    "instructions",
    "examples",
    "scope",
    "audience",
    "status",
    "exposeToMcp",
    "collections",
    "policyIds",
  ]);
  const slug = parseSkillSlug(body.slug);
  const title = textInput(body.title, MAX_SKILL_TITLE_LENGTH);
  const description = parseMultilineText(
    body.description,
    MAX_SKILL_DESCRIPTION_LENGTH,
    "Описание",
  );
  const instructions = parseMultilineText(
    body.instructions,
    MAX_SKILL_INSTRUCTIONS_LENGTH,
    "Инструкция",
  );
  const examples = parseExamples(body.examples);
  const scope = parseScope(body.scope);
  const audience = parseAudience(body.audience);
  const status = parseStatus(body.status);
  if (typeof body.exposeToMcp !== "boolean") {
    throw new InputError("Флаг exposeToMcp должен быть логическим значением");
  }
  const collections = parseBoundCollections(body.collections, scope);
  const policyIds = parseBoundPolicies(body.policyIds, audience);
  return {
    slug,
    title,
    description,
    instructions,
    examples,
    scope,
    audience,
    status,
    exposeToMcp: body.exposeToMcp,
    collections,
    policyIds,
  };
}

export interface SkillCatalogQuery {
  collection: string | null;
  workspaceId: string | null;
  q: string | null;
  limit: number;
}

export function parseSkillCatalogQuery(query: unknown): SkillCatalogQuery {
  if (query === undefined || query === null) {
    return { collection: null, workspaceId: null, q: null, limit: 50 };
  }
  const body = objectInput(query, ["collection", "workspaceId", "q", "limit"]);
  let collection: string | null = null;
  if (body.collection !== undefined && body.collection !== "") {
    if (typeof body.collection !== "string") {
      throw new InputError("Некорректный параметр collection");
    }
    const trimmed = body.collection.trim();
    if (trimmed) {
      if (trimmed.startsWith("asmblyr_")) {
        throw new InputError("Системные коллекции недоступны");
      }
      collection = parseCollectionName(trimmed);
    }
  }
  let workspaceId: string | null = null;
  if (body.workspaceId !== undefined && body.workspaceId !== "") {
    if (typeof body.workspaceId !== "string") {
      throw new InputError("Некорректный параметр workspaceId");
    }
    const trimmed = body.workspaceId.trim();
    if (trimmed) {
      if (!UUID_PATTERN.test(trimmed)) {
        throw new InputError(
          "Некорректный идентификатор рабочего пространства",
        );
      }
      workspaceId = trimmed.toLowerCase();
    }
  }
  let q: string | null = null;
  if (body.q !== undefined && body.q !== "") {
    if (typeof body.q !== "string" || body.q.length > 200) {
      throw new InputError("Некорректный поисковый запрос");
    }
    const trimmed = body.q.trim();
    if (trimmed) {
      q = trimmed;
    }
  }
  let limit = 50;
  if (body.limit !== undefined && body.limit !== "") {
    const parsed =
      typeof body.limit === "number"
        ? body.limit
        : typeof body.limit === "string" && /^\d+$/.test(body.limit)
          ? Number(body.limit)
          : NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new InputError(
        "Параметр limit должен быть целым числом от 1 до 100",
      );
    }
    limit = parsed;
  }
  return { collection, workspaceId, q, limit };
}
