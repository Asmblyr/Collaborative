import { objectInput } from "../shared/input.js";
import { AuthInputError } from "../auth/validation.js";
import { parseId } from "../policies/validation.js";
import { parseCollectionName } from "../items/validation.js";

export interface AssistantContext {
  page: string;
  workspaceId: string | null;
  collection?: string;
  record?: { id: string };
  table?: {
    page: number;
    size: number;
    sort: string;
    direction: "asc" | "desc";
    order?: import("@asmblyr-collaborative/contracts").ItemOrder;
    q: string;
    filter: string;
    selectedCount: number;
    editorOpen: boolean;
  };
}

type TableContext = NonNullable<AssistantContext["table"]>;
const contextPages = new Set([
  "home",
  "collections",
  "items",
  "files",
  "access",
  "services",
  "settings",
  "system-settings",
  "search",
]);

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new AuthInputError("Invalid table context");
  }
  return value;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new AuthInputError("Invalid table context");
  }
  return value;
}

function parseTableContext(value: unknown): TableContext {
  const table = objectInput(value, [
    "page",
    "size",
    "sort",
    "direction",
    "order",
    "q",
    "filter",
    "selectedCount",
    "editorOpen",
  ]);
  if (table.direction !== "asc" && table.direction !== "desc") {
    throw new AuthInputError("Invalid table context");
  }
  if (
    table.order !== undefined &&
    table.order !== "field" &&
    table.order !== "relevance"
  ) {
    throw new AuthInputError("Invalid table ordering mode");
  }
  if (typeof table.editorOpen !== "boolean") {
    throw new AuthInputError("Invalid table context");
  }
  return {
    page: integer(table.page, 1, 2147483647),
    size: integer(table.size, 1, 100),
    selectedCount: integer(table.selectedCount, 0, 100),
    sort: text(table.sort, 63),
    direction: table.direction,
    ...(table.order !== undefined ? { order: table.order } : {}),
    q: text(table.q, 255),
    filter: text(table.filter, 8192),
    editorOpen: table.editorOpen,
  };
}

export function parseAssistantContext(value: unknown): AssistantContext | null {
  if (value === undefined || value === null) {
    return null;
  }
  const body = objectInput(value, [
    "page",
    "workspaceId",
    "collection",
    "table",
    "record",
  ]);
  if (
    typeof body.page !== "string" ||
    (!contextPages.has(body.page) &&
      !/^extensions\/[a-z][a-z0-9_]{0,30}\/[a-z][a-z0-9-]{0,31}$/.test(
        body.page,
      ))
  ) {
    throw new AuthInputError("Invalid context page");
  }
  const workspaceId =
    body.workspaceId === null || body.workspaceId === undefined
      ? null
      : parseId(body.workspaceId);
  if (body.page !== "items") {
    if (
      body.collection !== undefined ||
      body.table !== undefined ||
      body.record !== undefined
    ) {
      throw new AuthInputError("Unexpected collection context");
    }
    return { page: body.page, workspaceId };
  }
  if (typeof body.collection !== "string") {
    throw new AuthInputError("Invalid collection context");
  }
  const collection = parseCollectionName(body.collection);
  if (collection.toLowerCase().startsWith("asmblyr_")) {
    throw new AuthInputError("System collection context is unavailable");
  }
  if (body.record !== undefined) {
    if (body.table !== undefined) {
      throw new AuthInputError("Choose table or record context");
    }
    const record = objectInput(body.record, ["id"]);
    if (
      typeof record.id !== "string" ||
      !record.id.trim() ||
      record.id.length > 255 ||
      record.id.includes("\0")
    ) {
      throw new AuthInputError("Invalid record context");
    }
    return {
      page: body.page,
      workspaceId,
      collection,
      record: { id: record.id },
    };
  }
  return {
    page: body.page,
    workspaceId,
    collection,
    table: parseTableContext(body.table),
  };
}
